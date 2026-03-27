import { HARMONIA_API_URL } from '@/src/config';
import { artistNames, normalizeSong } from '@/src/lib/song';
import type {
  HarmoniaAlbum,
  HarmoniaArtistEntity,
  HarmoniaUser,
  LibraryPayload,
  MusicSection,
  Playlist,
  SearchPayload,
  Song,
} from '@/src/types';

export type StreamQuality = 'automatic' | 'data-saver' | 'normal' | 'high' | 'maximum';

export type ResolvedStreamDiagnostics = {
  provider: string;
  source: 'proxy' | 'catalog';
  codec: string | null;
  bitrate: number | null;
  quality: string | null;
  streamHost: string;
};

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

function qualityScore(item: { quality?: string; bitrate?: number }) {
  const label = String(item?.quality || '').toLowerCase();
  if (/(lossless|flac|alac|wav)/.test(label)) return 1_000_000;
  return Number(label.match(/\d+/)?.[0] || item?.bitrate || 0);
}

function qualityCeiling(quality: StreamQuality) {
  switch (quality) {
    case 'data-saver': return 96;
    case 'normal': return 160;
    case 'high': return 320;
    case 'maximum': return Number.POSITIVE_INFINITY;
    default: return Number.POSITIVE_INFINITY;
  }
}

function pickAudioCandidate(
  candidates: Array<{
    quality?: string;
    url: string;
    bitrate?: number;
    codec?: string;
    mimeType?: string;
  }>,
  quality: StreamQuality
) {
  const available = [...candidates].filter((item) => item?.url);
  if (!available.length) return null;

  const ceiling = qualityCeiling(quality);
  const ranked = available.sort((a, b) => qualityScore(b) - qualityScore(a));
  if (!Number.isFinite(ceiling)) return ranked[0];

  return ranked.find((item) => qualityScore(item) <= ceiling) || ranked[ranked.length - 1];
}

function streamHost(url: string) {
  try {
    return new URL(url, HARMONIA_API_URL).host || 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function resolvePlayableSong(
  song: Song,
  quality: StreamQuality = 'automatic'
): Promise<{ song: Song; url: string; diagnostics: ResolvedStreamDiagnostics }> {
  const stable = normalizeSong(song as any);
  const source = String(stable.source || stable.provider || '').toLowerCase();
  const youtubeId = String(stable.videoId || stable.youtubeId || (source.includes('youtube') ? stable.id : ''));

  if (/^[A-Za-z0-9_-]{11}$/.test(youtubeId) && source.includes('youtube')) {
    const url = `${HARMONIA_API_URL}/api/yt-stream?id=${encodeURIComponent(youtubeId)}`;
    return {
      song: stable,
      url,
      diagnostics: {
        provider: String(stable.provider || stable.source || 'YouTube'),
        source: 'proxy',
        codec: null,
        bitrate: null,
        quality: quality === 'automatic' ? 'adaptive' : quality,
        streamHost: streamHost(url),
      },
    };
  }

  const details = stable.id ? await fetchSongs([stable.id]).catch(() => []) : [];
  const playable = details[0] || stable;
  const candidate = Array.isArray(playable.downloadUrl)
    ? pickAudioCandidate(playable.downloadUrl, quality)
    : null;

  if (!candidate?.url) {
    throw new ApiError('This track is currently unavailable');
  }

  const codec = String(candidate.codec || candidate.mimeType?.split('/').pop() || '').trim() || null;
  const bitrate = Number(candidate.bitrate || 0) || null;
  const resolvedQuality = String(candidate.quality || '').trim() || null;

  return {
    song: playable,
    url: candidate.url,
    diagnostics: {
      provider: String(playable.provider || playable.source || stable.provider || stable.source || 'Harmonia'),
      source: 'catalog',
      codec,
      bitrate,
      quality: resolvedQuality,
      streamHost: streamHost(candidate.url),
    },
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
