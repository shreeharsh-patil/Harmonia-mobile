import { HARMONIA_API_URL } from '@/src/config';
import { normalizeSong } from '@/src/lib/song';
import type {
  HarmoniaUser,
  LibraryPayload,
  MusicSection,
  Playlist,
  SearchPayload,
  Song,
} from '@/src/types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type RequestOptions = RequestInit & { token?: string | null };

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...init } = options;
  const response = await fetch(`${HARMONIA_API_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new ApiError(payload?.error || `Request failed (${response.status})`, response.status);
  }
  return payload as T;
}

export async function loginWithPassword(email: string, password: string) {
  return requestJson<{ success: true; accessToken: string; user: HarmoniaUser }>(
    '/api/mobile/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) }
  );
}

export async function exchangeMobileTicket(ticket: string) {
  return requestJson<{ success: true; accessToken: string; user: HarmoniaUser }>(
    '/api/mobile/auth/exchange',
    { method: 'POST', body: JSON.stringify({ ticket }) }
  );
}

export async function fetchMe(token: string) {
  return requestJson<{ success: true; user: HarmoniaUser }>('/api/mobile/me', { token });
}

export async function fetchLibrary(token: string) {
  const payload = await requestJson<{ success: true; data: LibraryPayload }>('/api/mobile/library', { token });
  return {
    ...payload.data,
    likedSongs: (payload.data.likedSongs || []).map((song) => normalizeSong(song as any)),
  };
}

export async function toggleLikedSong(token: string, song: Song) {
  return requestJson<{ success: true; liked: boolean; message?: string }>(
    '/api/mobile/liked/songs',
    { method: 'POST', token, body: JSON.stringify({ songData: song }) }
  );
}

export async function fetchPlaylists(token: string) {
  const payload = await requestJson<{ success: true; data: Playlist[] }>('/api/mobile/playlists', { token });
  return payload.data || [];
}

export async function createPlaylist(token: string, name: string) {
  const payload = await requestJson<{ success: true; data: Playlist }>(
    '/api/mobile/playlists',
    { method: 'POST', token, body: JSON.stringify({ name }) }
  );
  return payload.data;
}

export async function addSongToPlaylist(token: string, playlistId: string, songId: string) {
  return requestJson<{ success: true }>(
    `/api/mobile/playlists/${encodeURIComponent(playlistId)}/songs`,
    { method: 'POST', token, body: JSON.stringify({ songId }) }
  );
}

export async function fetchHomeSections(): Promise<MusicSection[]> {
  try {
    const curated = await requestJson<{ success: true; data: MusicSection[] }>('/api/curated-music');
    if (Array.isArray(curated.data) && curated.data.length) return curated.data;
  } catch {}

  const feed = await requestJson<{ success: true; data: { sections: MusicSection[] } }>('/api/music-feed?all=true');
  return feed.data?.sections || [];
}

export async function searchMusic(query: string, limit = 30): Promise<SearchPayload> {
  const payload = await requestJson<{ success: true; data: SearchPayload }>(
    `/api/search?query=${encodeURIComponent(query)}&limit=${limit}&page=1`
  );
  return {
    ...payload.data,
    songs: {
      ...payload.data.songs,
      results: (payload.data.songs?.results || []).map((song) => normalizeSong(song as any)),
    },
  };
}

export async function fetchSongs(ids: string[]): Promise<Song[]> {
  const clean = [...new Set(ids.filter(Boolean))];
  if (!clean.length) return [];
  const payload = await requestJson<{ success: true; data: Song[] }>(
    `/api/songs?ids=${encodeURIComponent(clean.join(','))}`,
    { cache: 'no-store' }
  );
  return (payload.data || []).map((song) => normalizeSong(song as any));
}

function qualityScore(item: { quality?: string }) {
  const label = String(item?.quality || '').toLowerCase();
  if (/(lossless|flac|alac|wav)/.test(label)) return 1_000_000;
  return Number(label.match(/\d+/)?.[0] || 0);
}

export async function resolvePlayableSong(song: Song): Promise<{ song: Song; url: string }> {
  const stable = normalizeSong(song as any);
  const source = String(stable.source || stable.provider || '').toLowerCase();
  const youtubeId = String(stable.videoId || stable.youtubeId || (source.includes('youtube') ? stable.id : ''));

  if (/^[A-Za-z0-9_-]{11}$/.test(youtubeId) && source.includes('youtube')) {
    return {
      song: stable,
      url: `${HARMONIA_API_URL}/api/yt-stream?id=${encodeURIComponent(youtubeId)}`,
    };
  }

  const details = stable.id ? await fetchSongs([stable.id]).catch(() => []) : [];
  const playable = details[0] || stable;
  const candidates = Array.isArray(playable.downloadUrl)
    ? [...playable.downloadUrl].filter((item) => item?.url).sort((a, b) => qualityScore(b) - qualityScore(a))
    : [];

  const url = candidates[0]?.url;
  if (!url) {
    throw new ApiError('This track is currently unavailable');
  }

  return { song: playable, url };
}

export async function fetchPlaylistSongs(playlist: Playlist): Promise<Song[]> {
  if (Array.isArray(playlist.tracks) && playlist.tracks.length) {
    return playlist.tracks.map((song) => normalizeSong(song as any));
  }
  if (Array.isArray(playlist.songIds) && playlist.songIds.length) {
    return fetchSongs(playlist.songIds.slice(0, 100));
  }

  const id = String(playlist.id || playlist._id || '');
  if (!id) return [];

  try {
    const payload = await requestJson<{ success: true; data: any }>(
      `/api/playlists/${encodeURIComponent(id)}`
    );
    const value = payload.data || {};
    if (Array.isArray(value.songs)) return value.songs.map((song: any) => normalizeSong(song));
    if (Array.isArray(value.tracks)) return value.tracks.map((song: any) => normalizeSong(song));
    if (Array.isArray(value.songIds)) return fetchSongs(value.songIds.slice(0, 100));
  } catch {}

  return [];
}
