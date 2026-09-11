import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  HAS_SPOTIFY_CANVAS_API,
  SPOTIFY_CANVAS_API_URL,
} from '@/src/config';
import type { Song } from '@/src/types';

export type CanvasMedia = {
  id?: string;
  url: string;
  trackUri?: string;
};

type CanvasCacheEntry = {
  media: CanvasMedia | null;
  expiresAt: number;
  touchedAt: number;
};

const SPOTIFY_TRACK_ID = /^[A-Za-z0-9]{22}$/;
const CANVAS_TIMEOUT_MS = 10_000;
const CANVAS_CACHE_KEY = 'harmonia.mobile.spotify-canvas.v1';
const POSITIVE_CANVAS_CACHE_MS = 7 * 24 * 60 * 60_000;
const NEGATIVE_CANVAS_CACHE_MS = 30 * 60_000;
const MAX_PERSISTED_CANVASES = 200;

const persistentCanvasCache = new Map<string, CanvasCacheEntry>();
let canvasCacheHydrated = false;
let canvasCacheHydration: Promise<void> | null = null;
let canvasCacheWrite: Promise<void> = Promise.resolve();

function candidateString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function validMedia(value: unknown): CanvasMedia | null {
  if (!value || typeof value !== 'object') return null;
  const media = value as Record<string, unknown>;
  const url = candidateString(media.url);
  if (!/^https:\/\//i.test(url)) return null;

  const id = candidateString(media.id);
  const trackUri = candidateString(media.trackUri);
  return {
    url,
    id: id || undefined,
    trackUri: trackUri || undefined,
  };
}

function trimCanvasCache() {
  while (persistentCanvasCache.size > MAX_PERSISTED_CANVASES) {
    const oldestKey = persistentCanvasCache.keys().next().value;
    if (!oldestKey) break;
    persistentCanvasCache.delete(oldestKey);
  }
}

async function hydrateCanvasCache() {
  if (canvasCacheHydrated) return;
  if (canvasCacheHydration) return canvasCacheHydration;

  canvasCacheHydration = (async () => {
    try {
      const raw = await AsyncStorage.getItem(CANVAS_CACHE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Record<string, Partial<CanvasCacheEntry>>;
      const now = Date.now();
      const entries = Object.entries(parsed)
        .filter(([, entry]) => Number(entry?.expiresAt || 0) > now)
        .sort(
          ([, left], [, right]) =>
            Number(left?.touchedAt || 0) - Number(right?.touchedAt || 0)
        );

      for (const [trackId, entry] of entries) {
        if (!SPOTIFY_TRACK_ID.test(trackId)) continue;
        const media = entry.media === null ? null : validMedia(entry.media);
        if (entry.media !== null && !media) continue;

        persistentCanvasCache.set(trackId, {
          media,
          expiresAt: Number(entry.expiresAt),
          touchedAt: Number(entry.touchedAt || now),
        });
      }

      trimCanvasCache();
    } catch {
      persistentCanvasCache.clear();
    } finally {
      canvasCacheHydrated = true;
      canvasCacheHydration = null;
    }
  })();

  return canvasCacheHydration;
}

function persistCanvasCache() {
  const snapshot = JSON.stringify(Object.fromEntries(persistentCanvasCache));
  canvasCacheWrite = canvasCacheWrite
    .catch(() => {})
    .then(() => AsyncStorage.setItem(CANVAS_CACHE_KEY, snapshot));
  return canvasCacheWrite;
}

async function readCachedCanvas(trackId: string) {
  await hydrateCanvasCache();

  const entry = persistentCanvasCache.get(trackId);
  if (!entry) return { hit: false, media: null as CanvasMedia | null };

  if (entry.expiresAt <= Date.now()) {
    persistentCanvasCache.delete(trackId);
    void persistCanvasCache();
    return { hit: false, media: null as CanvasMedia | null };
  }

  entry.touchedAt = Date.now();
  persistentCanvasCache.delete(trackId);
  persistentCanvasCache.set(trackId, entry);
  return { hit: true, media: entry.media };
}

async function cacheCanvas(trackId: string, media: CanvasMedia | null) {
  await hydrateCanvasCache();

  const now = Date.now();
  persistentCanvasCache.delete(trackId);
  persistentCanvasCache.set(trackId, {
    media,
    touchedAt: now,
    expiresAt:
      now + (media ? POSITIVE_CANVAS_CACHE_MS : NEGATIVE_CANVAS_CACHE_MS),
  });
  trimCanvasCache();

  try {
    await persistCanvasCache();
  } catch {
    // Canvas is an optional enhancement. Storage failures must not affect playback.
  }
}

function canvasEndpoint() {
  return /\/api\/canvas$/i.test(SPOTIFY_CANVAS_API_URL)
    ? SPOTIFY_CANVAS_API_URL
    : `${SPOTIFY_CANVAS_API_URL}/api/canvas`;
}

export function spotifyTrackId(song: Song | null | undefined) {
  if (!song) return null;

  const candidates = [
    song.spotifyId,
    song.spotifyUri,
    song.spotifyTrackId,
    song.spotifyTrackUri,
    song.externalIds && typeof song.externalIds === 'object'
      ? (song.externalIds as Record<string, unknown>).spotify
      : null,
    String(song.source || song.provider || '').toLowerCase().includes('spotify') ? song.id : null,
  ];

  for (const candidate of candidates) {
    const value = candidateString(candidate);
    const id = value.startsWith('spotify:track:') ? value.slice('spotify:track:'.length) : value;
    if (SPOTIFY_TRACK_ID.test(id)) return id;
  }

  return null;
}

export async function fetchCanvasMedia(song: Song, signal?: AbortSignal): Promise<CanvasMedia | null> {
  if (!HAS_SPOTIFY_CANVAS_API) return null;

  const trackId = spotifyTrackId(song);
  if (!trackId) return null;

  const cached = await readCachedCanvas(trackId);
  if (cached.hit) return cached.media;

  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), CANVAS_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${canvasEndpoint()}?trackId=${encodeURIComponent(trackId)}`,
      { headers: { Accept: 'application/json' }, signal: controller.signal }
    );
    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    const directCanvas =
      payload?.data?.canvasesList?.[0] ??
      payload?.canvasesList?.[0] ??
      payload?.canvas ??
      payload;

    const canvasUrl = candidateString(directCanvas?.canvasUrl);
    if (!/^https:\/\//i.test(canvasUrl)) {
      await cacheCanvas(trackId, null);
      return null;
    }

    const media: CanvasMedia = {
      id: candidateString(directCanvas?.id) || undefined,
      url: canvasUrl,
      trackUri:
        candidateString(directCanvas?.trackUri) || `spotify:track:${trackId}`,
    };

    await cacheCanvas(trackId, media);
    return media;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromParent);
  }
}
