/**
 * Adaptive artwork palette extraction for React Native.
 *
 * Ported from the Harmonia web client's lib/palette-extractor.js: weighted
 * color binning over a heavily downsampled copy of the artwork, then HSL
 * tuning so the resulting color is rich enough for ambient backgrounds
 * without washing out or going near-black.
 *
 * The pure color math, binning, and cache live in paletteCore.ts (Node-testable);
 * this module adds the RN pipeline: remote artwork is downloaded into the OS
 * cache directory, resized via expo-image-manipulator, base64 JPEG is decoded
 * with jpeg-js, and concurrent requests for the same URL share one in-flight
 * promise.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import jpeg from 'jpeg-js';
import { artworkUrl } from '@/src/lib/song';
import type { Song } from '@/src/types';
import {
  buildPaletteFromDominant,
  cachePalette,
  DEFAULT_PALETTE,
  dominantRgbFromPixels,
  readCachedPalette,
  type ArtworkPalette,
  type RawPixels,
} from '@/src/lib/paletteCore';

export type { ArtworkPalette };
export {
  DEFAULT_PALETTE,
  getLuminance,
  tuneColorForBackground,
  getHarmoniousSecondary,
} from '@/src/lib/paletteCore';

const paletteInFlight = new Map<string, Promise<ArtworkPalette>>();

/**
 * Extract raw RGBA pixels from an image URL at tiny scale.
 * Returns null when the image cannot be fetched or decoded.
 *
 * manipulateAsync only accepts local file URIs (and data URIs), so remote
 * artwork is first pulled into the OS cache directory. The temp file is
 * deleted after decoding so repeated extractions never grow the cache.
 * Other schemes (content:// etc.) are unsupported and return null.
 */
async function extractPixels(
  imageSrc: string,
  size: number
): Promise<RawPixels | null> {
  let tempFile: File | null = null;
  try {
    let localUri = imageSrc;

    if (/^data:image\//i.test(imageSrc) || /^file:/i.test(imageSrc) || imageSrc.startsWith('/')) {
      // Data URIs and local paths are supported by manipulateAsync directly.
      localUri = imageSrc;
    } else if (/^https?:\/\//i.test(imageSrc)) {
      tempFile = new File(
        Paths.cache,
        `harmonia-palette-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`
      );
      await File.downloadFileAsync(imageSrc, tempFile, { idempotent: true });
      if (!tempFile.exists) return null;
      localUri = tempFile.uri;
    } else {
      return null;
    }

    // JPEG keeps the base64 payload small; a 32px source is plenty for
    // palette binning (the web samples a 64px canvas).
    const result = await manipulateAsync(
      localUri,
      [{ resize: { width: size, height: size } }],
      { base64: true, format: SaveFormat.JPEG, compress: 0.8 }
    );
    if (!result.base64) return null;
    const decoded = jpeg.decode(
      Uint8Array.from(atob(result.base64), (ch) => ch.charCodeAt(0)),
      { useTArray: true, formatAsRGBA: true }
    );
    return {
      data: decoded.data as unknown as Uint8Array,
      width: decoded.width,
      height: decoded.height,
    };
  } catch {
    return null;
  } finally {
    if (tempFile) {
      try {
        if (tempFile.exists) tempFile.delete();
      } catch {
        // Cache cleanup is best-effort; the OS evicts this directory under
        // storage pressure regardless.
      }
    }
  }
}

async function runExtraction(imageSrc: string): Promise<ArtworkPalette> {
  try {
    const pixels = await extractPixels(imageSrc, 32);
    if (pixels) {
      const dominant = dominantRgbFromPixels(pixels);
      if (dominant) {
        const palette = buildPaletteFromDominant(dominant);
        cachePalette(imageSrc, palette);
        return palette;
      }
    }
  } catch {
    // Fall through to the default palette.
  }
  cachePalette(imageSrc, DEFAULT_PALETTE);
  return DEFAULT_PALETTE;
}

/**
 * Extract the tuned palette for an artwork URL.
 * Never rejects — resolves to DEFAULT_PALETTE on any failure.
 */
export async function extractArtworkPalette(
  imageSrc: string | null | undefined
): Promise<ArtworkPalette> {
  if (!imageSrc || typeof imageSrc !== 'string') return DEFAULT_PALETTE;

  const cached = readCachedPalette(imageSrc);
  if (cached) return cached;

  const inFlight = paletteInFlight.get(imageSrc);
  if (inFlight) return inFlight;

  const request = runExtraction(imageSrc);
  paletteInFlight.set(imageSrc, request);
  try {
    return await request;
  } finally {
    paletteInFlight.delete(imageSrc);
  }
}

/**
 * React hook: palette for a song's artwork. Returns the neutral default while
 * extracting; the result is cached so re-renders with the same song are free.
 */
export function useArtworkPalette(
  song: Song | null | undefined,
  size = 64
): ArtworkPalette {
  // artworkUrl walks many fields and runs regexes; memoize so re-renders from
  // unrelated context changes do not recompute it.
  const url = useMemo(
    () => (song ? artworkUrl(song, size) : ''),
    [song, size]
  );
  const [palette, setPalette] = useState<ArtworkPalette>(DEFAULT_PALETTE);
  const requestedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    requestedUrlRef.current = url;
    if (!url) {
      setPalette(DEFAULT_PALETTE);
      return;
    }
    const cached = readCachedPalette(url);
    if (cached) {
      setPalette(cached);
      return;
    }
    setPalette(DEFAULT_PALETTE);
    let active = true;
    const task = InteractionManager.runAfterInteractions(() => {
      void extractArtworkPalette(url).then((value) => {
        if (active && requestedUrlRef.current === url) setPalette(value);
      });
    });
    return () => {
      active = false;
      task.cancel();
    };
  }, [url]);

  return palette;
}
