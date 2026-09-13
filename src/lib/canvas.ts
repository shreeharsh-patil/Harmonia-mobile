import { HARMONIA_API_URL, HAS_HARMONIA_API } from '@/src/config';
import { artistNames } from '@/src/lib/song';
import type { Song } from '@/src/types';

export type CanvasMedia = {
  id?: string;
  url: string;
  trackUri?: string;
};

const SPOTIFY_TRACK_ID = /^[A-Za-z0-9]{22}$/;

function candidateString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
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
  if (!HAS_HARMONIA_API) return null;

  const trackId = spotifyTrackId(song);
  const params = new URLSearchParams({
    source: String(song.source || song.provider || 'jiosaavn'),
    sourceId: String(song.songId || song.id || ''),
    trackName: String(song.name || song.title || ''),
    artistName: artistNames(song),
    duration: String(song.duration || 0),
  });
  if (trackId) params.set('spotifyId', trackId);

  const response = await fetch(
    `${HARMONIA_API_URL}/api/proxy/spotify-canvas?${params.toString()}`,
    { headers: { Accept: 'application/json' }, signal }
  );
  if (!response.ok) return null;

  const payload = await response.json().catch(() => null);
  const canvasUrl = candidateString(payload?.canvasUrl);
  if (!/^https:\/\//i.test(canvasUrl)) return null;
  return {
    id: candidateString(payload?.spotifyTrackId) || undefined,
    url: canvasUrl,
    trackUri: payload?.spotifyTrackId ? `spotify:track:${payload.spotifyTrackId}` : undefined,
  };
}
