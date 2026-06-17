import { HARMONIA_API_URL } from '@/src/config';
import { artistNames, normalizeSong } from '@/src/lib/song';
import { resolveTrackStream } from '@/src/lib/playback/streamResolver';
import type { ResolvedStreamDiagnostics, StreamQuality } from '@/src/lib/playback/streamResolver';
export type { ResolvedStreamDiagnostics, StreamQuality } from '@/src/lib/playback/streamResolver';
import type {
  HarmoniaAlbum,
  HarmoniaArtistEntity,
  HarmoniaUser,
  LibraryPayload,
  MusicSection,
  Playlist,
  RecommendedMix,
  SearchPayload,
  Song,
} from '@/src/types';

export type LyricsResult = {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  lyricsProvider?: string | null;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const DEFAULT_API_TIMEOUT_MS = 15_000;

type RequestOptions = RequestInit & {
  token?: string | null;
  timeoutMs?: number;
};

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    token,
    headers,
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    signal: parentSignal,
    ...init
  } = options;

  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();

  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1_000, timeoutMs));

  try {
    const response = await fetch(`${HARMONIA_API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers || {}),
      },
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success === false) {
      throw new ApiError(
        payload?.error || payload?.message || `Request failed (${response.status})`,
        response.status
      );
    }

    return payload as T;
  } catch (cause: any) {
    if (timedOut) {
      throw new ApiError('Request timed out. Check your connection and try again.', 408);
    }

    if (parentSignal?.aborted || cause?.name === 'AbortError') {
      throw cause;
    }

    if (cause instanceof ApiError) throw cause;

    throw new ApiError(
      cause?.message || 'Unable to reach Harmonia. Check your connection and try again.',
      0
    );
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

export async function loginWithPassword(email: string, password: string) {
  return requestJson<{ success: true; accessToken: string; user: HarmoniaUser }>(
    '/api/mobile/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) }
  );
}


export async function registerAccount(name: string, email: string, password: string) {
  return requestJson<{ message: string; requiresVerification?: boolean }>(
    '/api/auth/register',
    { method: 'POST', body: JSON.stringify({ name, email, password }) }
  );
}

export async function verifyEmailAddress(email: string, otp: string) {
  return requestJson<{ message: string }>(
    '/api/auth/verify-email',
    { method: 'POST', body: JSON.stringify({ email, otp }) }
  );
}

export async function requestPasswordReset(email: string) {
  return requestJson<{ message: string }>(
    '/api/mobile/auth/forgot-password',
    { method: 'POST', body: JSON.stringify({ email }) }
  );
}

export async function resetPassword(token: string, password: string) {
  return requestJson<{ message: string }>(
    '/api/auth/reset-password',
    { method: 'POST', body: JSON.stringify({ token, password }) }
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


export async function updateProfile(
  token: string,
  update: { name?: string; image?: string | null }
) {
  const payload = await requestJson<{ success: true; user: HarmoniaUser }>(
    '/api/mobile/me',
    { method: 'PATCH', token, body: JSON.stringify(update), timeoutMs: 30_000 }
  );
  return payload.user;
}

export async function fetchLibrary(token: string): Promise<LibraryPayload> {
  const payload = await requestJson<{ success: true; data: any }>('/api/mobile/library', { token });
  const data = payload.data || {};
  return {
    playlists: Array.isArray(data.playlists) ? data.playlists : [],
    likedSongs: (data.likedSongs || []).map((song: any) => normalizeSong(song)),
    likedPlaylists: (data.likedPlaylists || []).map((item: any) => ({
      id: String(item.playlistId || item.id || ''),
      name: String(item.playlistName || item.name || 'Playlist'),
      owner: item.owner || 'Harmonia',
      description: item.description || '',
      image: item.image || [],
      songCount: Number(item.songCount || 0),
      source: item.source || 'jiosaavn',
    })),
    likedAlbums: (data.likedAlbums || []).map((item: any) => ({
      ...(item.albumData || {}),
      id: String(item.albumId || item.albumData?.id || ''),
    })),
    likedArtists: (data.likedArtists || []).map((item: any) => ({
      ...(item.artistData || {}),
      id: String(item.artistId || item.artistData?.id || ''),
    })),
  };
}

export async function toggleLikedSong(token: string, song: Song) {
  return requestJson<{ success: true; liked: boolean; message?: string }>(
    '/api/mobile/liked/songs',
    { method: 'POST', token, body: JSON.stringify({ songData: song }) }
  );
}

export async function toggleLikedEntity(
  token: string,
  type: 'albums' | 'artists' | 'playlists',
  itemData: HarmoniaAlbum | HarmoniaArtistEntity | Playlist
) {
  return requestJson<{ success: true; liked: boolean; message?: string }>(
    `/api/mobile/liked/${type}`,
    { method: 'POST', token, body: JSON.stringify({ itemData }) }
  );
}

export async function fetchRecommendedMixes(token: string): Promise<RecommendedMix[]> {
  const payload = await requestJson<{ success: true; data: any[] }>(
    '/api/mobile/recommendations',
    { token }
  );
  return (payload.data || []).map((mix: any) => ({
    id: String(mix._id || mix.id || `mix-${mix.mixIndex ?? ''}`),
    _mixId: String(mix._id || mix.id || ''),
    name: String(mix.title || 'Your Mix'),
    title: String(mix.title || 'Your Mix'),
    image: mix.coverImage ? [{ quality: 'default', url: mix.coverImage }] : [],
    songIds: Array.isArray(mix.songIds) ? mix.songIds.map(String) : [],
    songCount: Array.isArray(mix.songIds) ? mix.songIds.length : 0,
    source: 'mix',
    mixIndex: mix.mixIndex,
    sourceType: mix.sourceType,
    sourceId: mix.sourceId || null,
    generatedAt: mix.generatedAt,
    expiresAt: mix.expiresAt,
  }));
}

export async function refreshRecommendedMixes(token: string): Promise<RecommendedMix[]> {
  const payload = await requestJson<{ success: true; data: any[] }>(
    '/api/mobile/recommendations',
    { method: 'DELETE', token }
  );
  return (payload.data || []).map((mix: any) => ({
    id: String(mix._id || mix.id || `mix-${mix.mixIndex ?? ''}`),
    _mixId: String(mix._id || mix.id || ''),
    name: String(mix.title || 'Your Mix'),
    title: String(mix.title || 'Your Mix'),
    image: mix.coverImage ? [{ quality: 'default', url: mix.coverImage }] : [],
    songIds: Array.isArray(mix.songIds) ? mix.songIds.map(String) : [],
    songCount: Array.isArray(mix.songIds) ? mix.songIds.length : 0,
    source: 'mix',
    mixIndex: mix.mixIndex,
    sourceType: mix.sourceType,
    sourceId: mix.sourceId || null,
    generatedAt: mix.generatedAt,
    expiresAt: mix.expiresAt,
  }));
}

export async function fetchRecentlyPlayedPlaylists(token: string): Promise<Playlist[]> {
  const payload = await requestJson<{ success: true; data: any[] }>(
    '/api/mobile/recently-played-playlists',
    { token }
  );
  return (payload.data || []).map((item: any) => ({
    id: String(item.playlistId || ''),
    name: String(item.playlistName || 'Playlist'),
    image: item.image || [],
    songCount: Number(item.songCount || 0),
    source: item.source || 'jiosaavn',
    owner: item.owner || '',
    catalogSource: item.catalogSource || '',
    playedAt: item.playedAt,
  }));
}

export async function trackRecentlyPlayedPlaylist(token: string, playlist: Playlist) {
  const id = String(playlist.id || playlist._id || '');
  if (!id) return;
  return requestJson<{ success: true }>(
    '/api/mobile/recently-played-playlists',
    {
      method: 'POST',
      token,
      body: JSON.stringify({
        playlistData: {
          id,
          name: playlist.name || playlist.title || 'Playlist',
          image: playlist.image || [],
          songCount: playlist.songCount || playlist.songIds?.length || playlist.tracks?.length || 0,
          source: playlist.source || 'jiosaavn',
          catalogSource: String((playlist as any).catalogSource || ''),
          owner: typeof playlist.owner === 'string' ? playlist.owner : String(playlist.subtitle || ''),
        },
      }),
    }
  );
}

export async function clearRecentlyPlayedPlaylists(token: string) {
  return requestJson<{ success: true }>(
    '/api/mobile/recently-played-playlists',
    { method: 'DELETE', token }
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


export async function importSpotifyPlaylist(token: string, url: string) {
  return requestJson<{
    success: true;
    data: Playlist;
    matched: number;
    total: number;
    message: string;
  }>(
    '/api/mobile/playlists/import',
    { method: 'POST', token, body: JSON.stringify({ url }), timeoutMs: 60_000 }
  );
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

export async function searchMusic(query: string, limit = 30, signal?: AbortSignal): Promise<SearchPayload> {
  const payload = await requestJson<{ success: true; data: SearchPayload }>(
    `/api/search?query=${encodeURIComponent(query)}&limit=${limit}&page=1`,
    { signal }
  );
  return {
    ...payload.data,
    songs: {
      ...payload.data.songs,
      results: (payload.data.songs?.results || []).map((song) => normalizeSong(song as any)),
    },
  };
}

export async function fetchAlbum(id: string): Promise<HarmoniaAlbum> {
  const payload = await requestJson<{ success: true; data: HarmoniaAlbum }>(
    `/api/albums?id=${encodeURIComponent(id)}`
  );
  return payload.data;
}

export async function fetchArtist(id: string): Promise<HarmoniaArtistEntity> {
  const payload = await requestJson<{ success: true; data: HarmoniaArtistEntity }>(
    `/api/artists?id=${encodeURIComponent(id)}`
  );
  return payload.data;
}

export async function fetchArtistSongs(id: string, limit = 40): Promise<Song[]> {
  const payload = await requestJson<{ success: true; data: any }>(
    `/api/artists/${encodeURIComponent(id)}/songs?page=0&limit=${limit}`
  );
  const raw = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.data?.songs)
      ? payload.data.songs
      : Array.isArray(payload.data?.results)
        ? payload.data.results
        : [];
  return raw.map((song: any) => normalizeSong(song));
}

export async function fetchArtistAlbums(id: string, limit = 30): Promise<HarmoniaAlbum[]> {
  const payload = await requestJson<{ success: true; data: any }>(
    `/api/artists/${encodeURIComponent(id)}/albums?page=0&limit=${limit}`
  );
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.data?.albums)) return payload.data.albums;
  if (Array.isArray(payload.data?.results)) return payload.data.results;
  return [];
}

export async function fetchPlaylistDetails(id: string, token?: string | null): Promise<Playlist> {
  if (token) {
    try {
      const owned = await requestJson<{ success: true; data: Playlist }>(
        `/api/mobile/playlists/${encodeURIComponent(id)}`,
        { token }
      );
      return owned.data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw error;
    }
  }

  const payload = await requestJson<{ success: true; data: Playlist }>(
    `/api/playlists/${encodeURIComponent(id)}`
  );
  return payload.data;
}

export async function updatePlaylist(
  token: string,
  playlistId: string,
  update: { name?: string; description?: string; image?: string; isPublic?: boolean }
) {
  const payload = await requestJson<{ success: true; data: Playlist }>(
    `/api/mobile/playlists/${encodeURIComponent(playlistId)}`,
    { method: 'PATCH', token, body: JSON.stringify(update) }
  );
  return payload.data;
}

export async function deletePlaylist(token: string, playlistId: string) {
  return requestJson<{ success: true }>(
    `/api/mobile/playlists/${encodeURIComponent(playlistId)}`,
    { method: 'DELETE', token }
  );
}

export async function removeSongFromPlaylist(token: string, playlistId: string, songId: string) {
  return requestJson<{ success: true; data?: Playlist }>(
    `/api/mobile/playlists/${encodeURIComponent(playlistId)}/songs`,
    { method: 'DELETE', token, body: JSON.stringify({ songId }) }
  );
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


export async function fetchSongSuggestions(songId: string, limit = 20): Promise<Song[]> {
  if (!songId) return [];
  const payload = await requestJson<{ success: true; data: Song[] }>(
    `/api/songs/${encodeURIComponent(songId)}/suggestions?limit=${limit}`,
    { cache: 'no-store' }
  );
  return (payload.data || []).map((song) => normalizeSong(song as any));
}

export async function fetchLyrics(song: Song): Promise<LyricsResult | null> {
  const artist = artistNames(song);
  const title = song.name || song.title || '';
  if (!title) return null;

  const params = new URLSearchParams({
    endpoint: 'get',
    artist_name: artist,
    track_name: title,
  });
  if (song.duration) params.set('duration', String(Math.round(song.duration)));

  try {
    const exact = await requestJson<LyricsResult>(`/api/proxy/lyrics?${params.toString()}`);
    if (exact?.syncedLyrics || exact?.plainLyrics) {
      return { ...exact, lyricsProvider: 'LRCLib' };
    }
  } catch {}

  try {
    const search = await requestJson<Array<LyricsResult & { trackName?: string; artistName?: string }>>(
      `/api/proxy/lyrics?endpoint=search&q=${encodeURIComponent(`${artist} ${title}`)}`
    );
    const best = Array.isArray(search)
      ? search.find((item) => item?.syncedLyrics) || search.find((item) => item?.plainLyrics)
      : null;
    return best ? { ...best, lyricsProvider: 'LRCLib' } : null;
  } catch {
    return null;
  }
}

export async function resolvePlayableSong(
  song: Song,
  quality: StreamQuality = 'automatic'
): Promise<{ song: Song; url: string; diagnostics: ResolvedStreamDiagnostics }> {
  const resolved = await resolveTrackStream(song, { quality });
  return {
    song: resolved.track,
    url: resolved.url,
    diagnostics: resolved.diagnostics,
  };
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
