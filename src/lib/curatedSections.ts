import AsyncStorage from '@react-native-async-storage/async-storage';
import { HARMONIA_API_URL } from '@/src/config';
import { normalizeArtworkUrl } from '@/src/lib/song';
import type { HarmoniaImage, MusicSection, Playlist } from '@/src/types';

export const CURATED_SECTIONS_CACHE_KEY = 'harmonia.curated-music.live-sections.v12';
export const CURATED_SECTIONS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

let memoryCache: { data: MusicSection[]; ts: number } | null = null;
let inFlightRequest: Promise<MusicSection[]> | null = null;

export function getHarmoniaApiUrl(): string {
  if (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_HARMONIA_API_URL !== undefined) {
    return String(process.env.EXPO_PUBLIC_HARMONIA_API_URL || '').trim().replace(/\/$/, '');
  }
  return HARMONIA_API_URL;
}

export function hasHarmoniaApi(): boolean {
  return Boolean(getHarmoniaApiUrl());
}

export function normalizeImageUrls(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const normalized = normalizeArtworkUrl(trimmed);
    return normalized ? [normalized] : [];
  }
  if (Array.isArray(value)) {
    const urls: string[] = [];
    for (const item of value) {
      if (typeof item === 'string') {
        const normalized = normalizeArtworkUrl(item.trim());
        if (normalized) urls.push(normalized);
      } else if (item && typeof item === 'object') {
        const raw = (item as any).url || (item as any).src || (item as any).link || (item as any).href;
        if (raw) {
          const normalized = normalizeArtworkUrl(String(raw).trim());
          if (normalized) urls.push(normalized);
        }
      }
    }
    return urls;
  }
  if (typeof value === 'object' && value !== null) {
    const raw = (value as any).url || (value as any).src || (value as any).link || (value as any).href;
    if (raw) {
      const normalized = normalizeArtworkUrl(String(raw).trim());
      return normalized ? [normalized] : [];
    }
  }
  return [];
}

export function artworkKey(value: unknown): string {
  const url = String(value || '').trim();
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function chooseUniqueArtwork(playlist: any, usedArtwork: Set<string>): string {
  const candidates: string[] = [
    ...normalizeImageUrls(playlist?.image),
    ...normalizeImageUrls(playlist?.images),
    ...normalizeImageUrls(playlist?.collageImages),
    ...normalizeImageUrls(playlist?.spotifyImages),
  ];

  for (const candidate of candidates) {
    const key = artworkKey(candidate);
    if (!key || usedArtwork.has(key)) continue;
    usedArtwork.add(key);
    return candidate;
  }

  // Showing no image is better than showing another playlist's thumbnail.
  // Harmonia Mobile will render its deterministic generated fallback artwork.
  return '';
}

export function playlistIdentity(playlist: any): string {
  return String(
    playlist?.spotifyId ||
    playlist?.sourceUrl ||
    playlist?.source_url ||
    playlist?.spotifyUrl ||
    playlist?._id ||
    playlist?.id ||
    ''
  ).trim();
}

export function normalizeCuratedPlaylist(raw: any, usedArtwork: Set<string>): Playlist | null {
  if (!raw || typeof raw !== 'object') return null;

  const identity = playlistIdentity(raw);
  if (!identity) return null;

  const id = String(raw._id || raw.id || identity).trim();
  const spotifyId = String(raw.spotifyId || (id.startsWith('37i9dQ') || id.length === 22 ? id : '')).trim();
  const name = String(raw.name || raw.title || raw.playlistName || 'Untitled Playlist').trim();
  const description = String(raw.description || '').trim();

  const selectedArtwork = chooseUniqueArtwork(raw, usedArtwork);
  const image: HarmoniaImage[] = selectedArtwork
    ? [{ quality: '500x500', url: selectedArtwork }]
    : [];

  const collageImages = normalizeImageUrls(raw.collageImages);
  const songIds = Array.isArray(raw.songIds)
    ? raw.songIds.map((s: any) => String(s || '').trim()).filter(Boolean)
    : [];
  const songCount = Array.isArray(raw.tracks)
    ? raw.tracks.length
    : (songIds.length || Number(raw.songCount || 0));

  const sourceType = String(raw.sourceType || raw.source || 'spotify');
  const source = String(raw.source || 'spotify');
  const catalogSource = String(raw.catalogSource || 'provider');
  const sourceUrl = String(
    raw.sourceUrl ||
    raw.source_url ||
    raw.spotifyUrl ||
    (spotifyId ? `https://open.spotify.com/playlist/${spotifyId}` : '')
  ).trim();
  const order = Number(raw.order || 0);

  return {
    ...raw,
    id,
    _id: id,
    spotifyId,
    name,
    title: name,
    description,
    image,
    collageImages,
    songCount,
    sourceType,
    source,
    catalogSource,
    sourceUrl,
    songIds,
    order,
  };
}

export function normalizeCuratedSections(rawSections: any[]): MusicSection[] {
  if (!Array.isArray(rawSections)) return [];

  return rawSections
    .map((section, sectionIndex) => {
      if (!section || typeof section !== 'object') return null;

      const rawPlaylists = Array.isArray(section.playlists) ? section.playlists : [];
      const seenPlaylists = new Set<string>();
      const usedArtwork = new Set<string>();

      const playlists: Playlist[] = [];
      for (const raw of rawPlaylists) {
        const identity = playlistIdentity(raw);
        if (!identity || seenPlaylists.has(identity)) continue;
        seenPlaylists.add(identity);

        const normalized = normalizeCuratedPlaylist(raw, usedArtwork);
        if (normalized) playlists.push(normalized);
      }

      if (playlists.length === 0) return null;

      const id = String(section._id || section.id || `section-${sectionIndex}`).trim();
      const name = String(section.name || section.title || 'Music').trim();
      const genreId = String(section.genreId || '').trim();
      const genreName = String(section.genreName || '').trim();
      const order = Number(section.order ?? sectionIndex);

      return {
        ...section,
        _id: id,
        id,
        name,
        genreId,
        genreName,
        order,
        playlists,
      };
    })
    .filter(Boolean) as MusicSection[];
}

export async function readCuratedSectionsCache(): Promise<{ data: MusicSection[]; isFresh: boolean }> {
  const now = Date.now();
  if (memoryCache && memoryCache.data.length > 0) {
    const isFresh = now - memoryCache.ts < CURATED_SECTIONS_CACHE_TTL_MS;
    return { data: memoryCache.data, isFresh };
  }

  try {
    const raw = await AsyncStorage.getItem(CURATED_SECTIONS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.data) && parsed.data.length > 0) {
        const ts = Number(parsed.ts || 0);
        const isFresh = now - ts < CURATED_SECTIONS_CACHE_TTL_MS;
        memoryCache = { data: parsed.data, ts };
        return { data: parsed.data, isFresh };
      }
    }
  } catch {}

  return { data: [], isFresh: false };
}

export async function saveCuratedSectionsCache(data: MusicSection[]): Promise<void> {
  if (!Array.isArray(data) || data.length === 0) return;
  const ts = Date.now();
  memoryCache = { data, ts };
  try {
    await AsyncStorage.setItem(
      CURATED_SECTIONS_CACHE_KEY,
      JSON.stringify({ data, ts })
    );
  } catch {}
}

export function clearCuratedSectionsMemoryCache(): void {
  memoryCache = null;
  inFlightRequest = null;
}

async function requestBackendJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();

  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortFromParent, { once: true });

  const timeout = setTimeout(() => {
    controller.abort();
  }, 15_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    return payload as T;
  } catch (err: any) {
    if (signal?.aborted) throw err;
    return null;
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', abortFromParent);
  }
}

/**
 * Fetch live curated music sections from the Harmonia backend database.
 * Primary: /api/curated-music?source=live-v12
 * Fallback: /api/sections?includePlaylists=true&source=live-v12
 * Never falls back to hardcoded/bundled playlists.
 */
export async function fetchLiveMusicSections(
  options: { forceRefresh?: boolean; signal?: AbortSignal } = {}
): Promise<MusicSection[]> {
  const { forceRefresh = false, signal } = options;

  const cached = await readCuratedSectionsCache();
  if (!forceRefresh && cached.isFresh && cached.data.length > 0) {
    return cached.data;
  }

  if (inFlightRequest) {
    return inFlightRequest;
  }

  const performFetch = async (): Promise<MusicSection[]> => {
    const apiUrl = getHarmoniaApiUrl();
    if (!apiUrl) {
      // If no backend is configured, return valid cached data if present.
      if (cached.data.length > 0) return cached.data;
      return [];
    }

    let loadedSections: MusicSection[] = [];

    // 1. Primary endpoint: live database-backed curated endpoint
    try {
      const primaryUrl = `${apiUrl}/api/curated-music?source=live-v12`;
      const primaryPayload = await requestBackendJson<{ success?: boolean; data?: any[] }>(
        primaryUrl,
        signal
      );
      if (primaryPayload?.success && Array.isArray(primaryPayload.data)) {
        loadedSections = normalizeCuratedSections(primaryPayload.data);
      }
    } catch (err: any) {
      if (signal?.aborted) throw err;
    }

    // 2. Secondary fallback: live sections endpoint (only if primary was empty/failed)
    if (loadedSections.length === 0) {
      try {
        const secondaryUrl = `${apiUrl}/api/sections?includePlaylists=true&source=live-v12`;
        const secondaryPayload = await requestBackendJson<{ success?: boolean; data?: any[] }>(
          secondaryUrl,
          signal
        );
        if (secondaryPayload?.success && Array.isArray(secondaryPayload.data)) {
          loadedSections = normalizeCuratedSections(secondaryPayload.data);
        }
      } catch (err: any) {
        if (signal?.aborted) throw err;
      }
    }

    if (loadedSections.length > 0) {
      await saveCuratedSectionsCache(loadedSections);
      return loadedSections;
    }

    // If both live endpoints failed but we have cached data, return cached data
    if (cached.data.length > 0) {
      return cached.data;
    }

    return [];
  };

  const request = performFetch().finally(() => {
    if (inFlightRequest === request) {
      inFlightRequest = null;
    }
  });

  inFlightRequest = request;
  return request;
}
