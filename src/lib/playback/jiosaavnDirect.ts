import CryptoJS from 'crypto-js';

export type DirectSaavnCandidate = {
  url: string;
  quality: string;
  bitrate: number;
  codec: 'aac';
  mimeType: 'audio/mp4';
};

export type DirectSaavnSearchTrack = {
  id: string;
  title: string;
  album: string | null;
  artists: string[];
  duration: number | null;
  image: string | null;
};

export type DirectSaavnTrack = DirectSaavnSearchTrack & {
  candidates: DirectSaavnCandidate[];
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const JIOSAAVN_API_URL = 'https://www.jiosaavn.com/api.php';
const DES_KEY = '38346591';

function decodeHtml(value: unknown) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeText(value: unknown) {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/i, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleForRecordingMatch(value: unknown) {
  return decodeHtml(value)
    .replace(/\((?:with|feat\.?|ft\.?|featuring)\s+[^)]*\)/gi, ' ')
    .replace(/\[(?:with|feat\.?|ft\.?|featuring)\s+[^\]]*\]/gi, ' ')
    .replace(/\b(?:feat\.?|ft\.?|featuring)\b.*$/gi, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim();
}

function normalizeRecordingTitle(value: unknown) {
  return titleForRecordingMatch(value).toLowerCase();
}

function decryptMediaUrl(encrypted: string) {
  if (!encrypted) return null;

  try {
    const ciphertext = CryptoJS.enc.Base64.parse(encrypted);
    const key = CryptoJS.enc.Utf8.parse(DES_KEY);
    const result = CryptoJS.DES.decrypt(
      { ciphertext } as any,
      key,
      {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      }
    );
    const value = result.toString(CryptoJS.enc.Utf8).trim();
    return /^https?:\/\//i.test(value) ? value : null;
  } catch {
    return null;
  }
}

function streamCandidates(url: string, supports320: boolean): DirectSaavnCandidate[] {
  const match = url.match(/_(48|96|160|320)\.(mp4|aac|m4a)(?=\?|$)/i);
  if (!match) {
    return [{
      url,
      quality: 'unknown',
      bitrate: 0,
      codec: 'aac',
      mimeType: 'audio/mp4',
    }];
  }

  const currentKbps = Number(match[1]);
  const extension = match[2];
  const values = new Map<number, string>();
  values.set(currentKbps, url);

  // A track explicitly marked 320-capable exposes the normal JioSaavn AAC
  // ladder. Build those CDN variants locally so quality changes do not need
  // a Harmonia server round-trip.
  if (supports320) {
    for (const kbps of [96, 160, 320]) {
      values.set(kbps, url.replace(match[0], `_${kbps}.${extension}`));
    }
  }

  return [...values.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([kbps, candidateUrl]) => ({
      url: candidateUrl,
      quality: `${kbps}kbps`,
      bitrate: kbps * 1000,
      codec: 'aac' as const,
      mimeType: 'audio/mp4' as const,
    }));
}

function firstSong(payload: any, id: string) {
  if (payload && typeof payload === 'object') {
    if (payload[id] && typeof payload[id] === 'object') return payload[id];
    if (Array.isArray(payload.songs)) return payload.songs[0] || null;
    const firstObject = Object.values(payload).find(
      (value) => value && typeof value === 'object' && !Array.isArray(value)
    );
    return firstObject || null;
  }
  return null;
}

async function requestJson(
  params: Record<string, string>,
  {
    fetchImpl,
    signal,
    timeoutMs,
  }: {
    fetchImpl: FetchLike;
    signal?: AbortSignal;
    timeoutMs: number;
  }
) {
  const controller = new AbortController();
  let timedOut = false;
  const abortParent = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortParent, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const query = new URLSearchParams(params);
    const response = await fetchImpl(`${JIOSAAVN_API_URL}?${query.toString()}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-IN,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/134 Mobile Safari/537.36',
      },
    });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  } catch (error: any) {
    // An internal provider timeout is a provider failure, not a caller
    // cancellation. Keeping those cases distinct lets the stream resolver try
    // the next provider while still stopping immediately when the caller aborts.
    if (timedOut && !signal?.aborted && error?.name === 'AbortError') {
      const timeoutError = new Error('JioSaavn request timed out.');
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortParent);
  }
}

function rawArtists(raw: any) {
  const primary = raw?.more_info?.artistMap?.primary_artists;
  if (Array.isArray(primary)) {
    return primary.map((artist: any) => decodeHtml(artist?.name)).filter(Boolean);
  }

  const fallback = raw?.more_info?.artistMap?.artists;
  if (Array.isArray(fallback)) {
    return fallback.map((artist: any) => decodeHtml(artist?.name)).filter(Boolean);
  }

  return String(raw?.more_info?.music || raw?.subtitle || '')
    .split(',')
    .map((value) => decodeHtml(value).trim())
    .filter(Boolean);
}

function rawDuration(raw: any) {
  const duration = Number(raw?.more_info?.duration || raw?.duration || 0);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function matchScore(
  raw: any,
  target: { title: string; artist?: string | null; duration?: number | null }
) {
  const targetTitle = normalizeRecordingTitle(target.title);
  const candidateTitle = normalizeRecordingTitle(raw?.title);
  if (!targetTitle || !candidateTitle) return 0;

  let score = 0;
  if (targetTitle === candidateTitle) score += 60;
  else if (targetTitle.includes(candidateTitle) || candidateTitle.includes(targetTitle)) score += 35;

  const targetArtist = normalizeText(target.artist || '');
  const candidateArtists = normalizeText(rawArtists(raw).join(' '));
  if (targetArtist && candidateArtists) {
    if (targetArtist === candidateArtists) score += 25;
    else if (targetArtist.includes(candidateArtists) || candidateArtists.includes(targetArtist)) score += 15;
  }

  const candidateDuration = rawDuration(raw);
  if (target.duration && candidateDuration) {
    const delta = Math.abs(target.duration - candidateDuration);
    if (delta <= 2) score += 20;
    else if (delta <= 5) score += 10;
    else if (delta > 15) score -= 25;
  }

  return score;
}

function toSearchTrack(raw: any, fallbackId = ''): DirectSaavnSearchTrack {
  const moreInfo = raw?.more_info || {};
  return {
    id: String(raw?.id || fallbackId),
    title: decodeHtml(raw?.title || ''),
    album: moreInfo.album ? decodeHtml(moreInfo.album) : null,
    artists: rawArtists(raw),
    duration: rawDuration(raw),
    image: typeof raw?.image === 'string'
      ? raw.image.replace(/150x150|50x50/g, '500x500')
      : null,
  };
}

function toDirectTrack(raw: any, fallbackId: string): DirectSaavnTrack | null {
  const moreInfo = raw?.more_info || {};
  const decrypted = decryptMediaUrl(String(moreInfo.encrypted_media_url || ''));
  if (!decrypted) return null;

  return {
    ...toSearchTrack(raw, fallbackId),
    candidates: streamCandidates(
      decrypted,
      String(moreInfo['320kbps'] || '').toLowerCase() === 'true'
    ),
  };
}

export async function fetchDirectJioSaavnTrack(
  id: string,
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = 8000,
  }: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<DirectSaavnTrack | null> {
  const cleanId = String(id || '').trim();
  if (!cleanId) return null;

  try {
    const payload = await requestJson({
      __call: 'song.getDetails',
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'android',
      pids: cleanId,
    }, { fetchImpl, signal, timeoutMs });

    const raw: any = firstSong(payload, cleanId);
    return raw ? toDirectTrack(raw, cleanId) : null;
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return null;
  }
}

export async function findDirectJioSaavnTrack(
  target: {
    title: string;
    artist?: string | null;
    duration?: number | null;
  },
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = 8000,
  }: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<DirectSaavnTrack | null> {
  const title = String(target.title || '').trim();
  if (!title) return null;

  try {
    const query = [titleForRecordingMatch(title), target.artist].filter(Boolean).join(' ');
    const payload = await requestJson({
      __call: 'search.getResults',
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'android',
      q: query,
      p: '1',
      n: '10',
    }, { fetchImpl, signal, timeoutMs });

    const results = Array.isArray(payload?.results) ? payload.results : [];
    const ranked = results
      .map((raw: any) => ({ raw, score: matchScore(raw, target) }))
      .sort((a: any, b: any) => b.score - a.score);

    const best = ranked[0];
    if (!best || best.score < 50) return null;

    // Search responses often already contain the encrypted URL. Prefer that
    // zero-extra-request path, but refresh by id when the field is absent.
    const direct = toDirectTrack(best.raw, String(best.raw?.id || ''));
    if (direct) return direct;

    return fetchDirectJioSaavnTrack(String(best.raw?.id || ''), {
      fetchImpl,
      signal,
      timeoutMs,
    });
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return null;
  }
}


export async function searchDirectJioSaavn(
  query: string,
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = 8000,
    limit = 30,
  }: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
    limit?: number;
  } = {}
): Promise<DirectSaavnSearchTrack[]> {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  try {
    const payload = await requestJson({
      __call: 'search.getResults',
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'android',
      q: cleanQuery,
      p: '1',
      n: String(Math.max(1, Math.min(50, limit))),
    }, { fetchImpl, signal, timeoutMs });

    const results = Array.isArray(payload?.results) ? payload.results : [];
    return results
      .map((raw: any) => toSearchTrack(raw))
      .filter((track: DirectSaavnSearchTrack) => Boolean(track.id && track.title))
      .slice(0, limit);
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return [];
  }
}


export type DirectSaavnPlaylistSearch = {
  id: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  songCount: number;
};

export type DirectSaavnPlaylist = DirectSaavnPlaylistSearch & {
  tracks: DirectSaavnTrack[];
};

export type DirectSaavnAlbumSearch = {
  id: string;
  title: string;
  year: string | null;
  image: string | null;
  artists: string[];
};

export type DirectSaavnArtistSearch = {
  id: string;
  name: string;
  image: string | null;
  role: string | null;
};

function payloadSongs(payload: any) {
  if (Array.isArray(payload?.songs)) return payload.songs;
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    return Object.values(payload).filter((value: any) => value && typeof value === 'object' && value.id);
  }
  return [];
}

export async function fetchDirectJioSaavnTracks(
  ids: string[],
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = 8000,
  }: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<DirectSaavnTrack[]> {
  const cleanIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!cleanIds.length) return [];

  const chunks: string[][] = [];
  for (let index = 0; index < cleanIds.length; index += 50) {
    chunks.push(cleanIds.slice(index, index + 50));
  }

  const fetchChunk = async (chunk: string[]) => {
    try {
      const payload = await requestJson({
        __call: 'song.getDetails',
        _format: 'json',
        _marker: '0',
        api_version: '4',
        ctx: 'android',
        pids: chunk.join(','),
      }, { fetchImpl, signal, timeoutMs });

      return payloadSongs(payload)
        .map((raw: any) => toDirectTrack(raw, String(raw?.id || '')))
        .filter(Boolean) as DirectSaavnTrack[];
    } catch (error: any) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      return [];
    }
  };

  const resolved = await Promise.all(chunks.map(fetchChunk));

  const byId = new Map<string, DirectSaavnTrack>();
  for (const track of resolved.flat()) byId.set(String(track.id), track);

  // Provider batch responses occasionally omit otherwise valid ids, and a
  // transient failure used to make every omitted song silently disappear from
  // a playlist. Retry only the missing ids in small groups to recover partial
  // batches without turning a 100-song playlist into 100 network requests.
  const missing = cleanIds.filter((id) => !byId.has(id));
  for (let index = 0; index < missing.length; index += 10) {
    const retried = await fetchChunk(missing.slice(index, index + 10));
    for (const track of retried) byId.set(String(track.id), track);
  }

  return cleanIds.map((id) => byId.get(id)).filter(Boolean) as DirectSaavnTrack[];
}

export async function searchDirectJioSaavnPlaylists(
  query: string,
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = 8000,
    limit = 20,
  }: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
    limit?: number;
  } = {}
): Promise<DirectSaavnPlaylistSearch[]> {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  try {
    const payload = await requestJson({
      __call: 'search.getPlaylistResults',
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'android',
      q: cleanQuery,
      p: '0',
      n: String(Math.max(1, Math.min(50, limit))),
    }, { fetchImpl, signal, timeoutMs });

    const results = Array.isArray(payload?.results) ? payload.results : [];
    return results
      .map((raw: any) => ({
        id: String(raw?.id || raw?.listid || ''),
        title: decodeHtml(raw?.title || raw?.listname || ''),
        subtitle: raw?.subtitle || raw?.header_desc
          ? decodeHtml(raw.subtitle || raw.header_desc)
          : null,
        image: typeof raw?.image === 'string'
          ? raw.image.replace(/150x150|50x50/g, '500x500')
          : null,
        songCount: Number(raw?.list_count || raw?.song_count || 0) || 0,
      }))
      .filter((item: DirectSaavnPlaylistSearch) => Boolean(item.id && item.title))
      .slice(0, limit);
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return [];
  }
}

export async function searchDirectJioSaavnAlbums(
  query: string,
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = 8000,
    limit = 20,
  }: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
    limit?: number;
  } = {}
): Promise<DirectSaavnAlbumSearch[]> {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  try {
    const payload = await requestJson({
      __call: 'search.getAlbumResults',
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'android',
      q: cleanQuery,
      p: '0',
      n: String(Math.max(1, Math.min(50, limit))),
    }, { fetchImpl, signal, timeoutMs });

    const results = Array.isArray(payload?.results) ? payload.results : [];
    return results
      .map((raw: any) => ({
        id: String(raw?.id || raw?.albumid || ''),
        title: decodeHtml(raw?.title || raw?.name || ''),
        year: raw?.year ? String(raw.year) : null,
        image: providerImage(raw?.image),
        artists: rawArtists(raw),
      }))
      .filter((item: DirectSaavnAlbumSearch) => Boolean(item.id && item.title))
      .slice(0, limit);
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return [];
  }
}

export async function searchDirectJioSaavnArtists(
  query: string,
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = 8000,
    limit = 20,
  }: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
    limit?: number;
  } = {}
): Promise<DirectSaavnArtistSearch[]> {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  try {
    const payload = await requestJson({
      __call: 'search.getArtistResults',
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'android',
      q: cleanQuery,
      p: '0',
      n: String(Math.max(1, Math.min(50, limit))),
    }, { fetchImpl, signal, timeoutMs });

    const results = Array.isArray(payload?.results) ? payload.results : [];
    return results
      .map((raw: any) => ({
        id: String(raw?.id || raw?.artistId || ''),
        name: decodeHtml(raw?.name || raw?.title || ''),
        image: providerImage(raw?.image),
        role: raw?.role ? decodeHtml(raw.role) : null,
      }))
      .filter((item: DirectSaavnArtistSearch) => Boolean(item.id && item.name))
      .slice(0, limit);
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return [];
  }
}

export async function fetchDirectJioSaavnPlaylist(
  id: string,
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = 8000,
  }: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<DirectSaavnPlaylist | null> {
  const cleanId = String(id || '').trim();
  if (!cleanId) return null;

  try {
    const payload = await requestJson({
      __call: 'playlist.getDetails',
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'android',
      listid: cleanId,
    }, { fetchImpl, signal, timeoutMs });

    if (!payload || typeof payload !== 'object') return null;
    const tracks = payloadSongs(payload)
      .map((raw: any) => toDirectTrack(raw, String(raw?.id || '')))
      .filter(Boolean) as DirectSaavnTrack[];

    const title = decodeHtml(payload?.title || payload?.listname || '');
    if (!title && !tracks.length) return null;

    return {
      id: String(payload?.id || payload?.listid || cleanId),
      title: title || 'Playlist',
      subtitle: payload?.subtitle || payload?.header_desc
        ? decodeHtml(payload.subtitle || payload.header_desc)
        : null,
      image: typeof payload?.image === 'string'
        ? payload.image.replace(/150x150|50x50/g, '500x500')
        : null,
      songCount: Number(payload?.list_count || payload?.song_count || tracks.length || 0) || tracks.length,
      tracks,
    };
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return null;
  }
}


export type DirectSaavnAlbum = {
  id: string;
  title: string;
  year: string | null;
  image: string | null;
  artists: string[];
  tracks: DirectSaavnTrack[];
};

export type DirectSaavnArtist = {
  id: string;
  name: string;
  image: string | null;
  followerCount: number | null;
  topTracks: DirectSaavnTrack[];
  albums: {
    id: string;
    title: string;
    year: string | null;
    image: string | null;
  }[];
};

function providerImage(value: any) {
  if (typeof value === 'string' && value) {
    return value.replace(/^http:\/\//i, 'https://').replace(/150x150|50x50/g, '500x500');
  }
  if (Array.isArray(value)) {
    const item = [...value].reverse().find((entry) => entry?.url || typeof entry === 'string');
    const url = typeof item === 'string' ? item : item?.url;
    return typeof url === 'string'
      ? url.replace(/^http:\/\//i, 'https://').replace(/150x150|50x50/g, '500x500')
      : null;
  }
  return null;
}

async function hydrateRawTracks(
  rawSongs: any[],
  options: { fetchImpl: FetchLike; signal?: AbortSignal; timeoutMs: number }
) {
  const direct = rawSongs
    .map((raw: any) => toDirectTrack(raw, String(raw?.id || '')))
    .filter(Boolean) as DirectSaavnTrack[];

  const seen = new Set(direct.map((track) => String(track.id)));
  const missingIds = rawSongs
    .map((raw: any) => String(raw?.id || '').trim())
    .filter((id) => id && !seen.has(id));

  if (!missingIds.length) return direct;
  const hydrated = await fetchDirectJioSaavnTracks(missingIds, options);
  const byId = new Map([...direct, ...hydrated].map((track) => [String(track.id), track] as const));
  return rawSongs
    .map((raw: any) => byId.get(String(raw?.id || '')))
    .filter(Boolean) as DirectSaavnTrack[];
}

export async function fetchDirectJioSaavnAlbum(
  id: string,
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = 8000,
  }: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<DirectSaavnAlbum | null> {
  const cleanId = String(id || '').trim();
  if (!cleanId) return null;

  try {
    const payload = await requestJson({
      __call: 'content.getAlbumDetails',
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'android',
      albumid: cleanId,
    }, { fetchImpl, signal, timeoutMs });

    if (!payload || typeof payload !== 'object') return null;
    const rawSongs = Array.isArray(payload?.songs)
      ? payload.songs
      : Array.isArray(payload?.list)
        ? payload.list
        : [];
    const tracks = await hydrateRawTracks(rawSongs, { fetchImpl, signal, timeoutMs });
    const artistMap = payload?.artistMap || {};
    const artists = Array.isArray(artistMap?.primary_artists)
      ? artistMap.primary_artists.map((artist: any) => decodeHtml(artist?.name)).filter(Boolean)
      : [];

    const title = decodeHtml(payload?.title || payload?.name || '');
    if (!title && !tracks.length) return null;

    return {
      id: String(payload?.id || payload?.albumid || cleanId),
      title: title || 'Album',
      year: payload?.year ? String(payload.year) : null,
      image: providerImage(payload?.image),
      artists,
      tracks,
    };
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return null;
  }
}

export async function fetchDirectJioSaavnArtist(
  id: string,
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = 8000,
  }: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<DirectSaavnArtist | null> {
  const cleanId = String(id || '').trim();
  if (!cleanId) return null;

  try {
    const payload = await requestJson({
      __call: 'artist.getArtistPageDetails',
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'android',
      artistId: cleanId,
    }, { fetchImpl, signal, timeoutMs });

    if (!payload || typeof payload !== 'object') return null;
    const rawTracks = Array.isArray(payload?.topSongs) ? payload.topSongs : [];
    const topTracks = await hydrateRawTracks(rawTracks, { fetchImpl, signal, timeoutMs });
    const albums = (Array.isArray(payload?.topAlbums) ? payload.topAlbums : [])
      .map((album: any) => ({
        id: String(album?.id || album?.albumid || ''),
        title: decodeHtml(album?.title || album?.name || ''),
        year: album?.year ? String(album.year) : null,
        image: providerImage(album?.image),
      }))
      .filter((album: any) => Boolean(album.id && album.title));

    const name = decodeHtml(payload?.name || '');
    if (!name && !topTracks.length) return null;

    const followers = Number(payload?.follower_count || 0);
    return {
      id: String(payload?.artistId || cleanId),
      name: name || 'Artist',
      image: providerImage(payload?.image),
      followerCount: Number.isFinite(followers) && followers > 0 ? followers : null,
      topTracks,
      albums,
    };
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return null;
  }
}

export async function fetchDirectJioSaavnArtistTracks(
  id: string,
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = 8000,
    limit = 40,
  }: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
    limit?: number;
  } = {}
): Promise<DirectSaavnTrack[]> {
  const cleanId = String(id || '').trim();
  if (!cleanId) return [];

  try {
    const payload = await requestJson({
      __call: 'artist.getArtistMoreSong',
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'android',
      artistId: cleanId,
      p: '0',
      n: String(Math.max(1, Math.min(100, limit))),
    }, { fetchImpl, signal, timeoutMs });

    const rawTracks = Array.isArray(payload?.songs)
      ? payload.songs
      : Array.isArray(payload?.topSongs)
        ? payload.topSongs
        : Array.isArray(payload?.results)
          ? payload.results
          : [];
    return hydrateRawTracks(rawTracks, { fetchImpl, signal, timeoutMs });
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return [];
  }
}

export async function fetchDirectJioSaavnArtistAlbums(
  id: string,
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = 8000,
    limit = 30,
  }: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
    limit?: number;
  } = {}
) {
  const cleanId = String(id || '').trim();
  if (!cleanId) return [];

  try {
    const payload = await requestJson({
      __call: 'artist.getArtistMoreAlbum',
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'android',
      artistId: cleanId,
      p: '0',
      n: String(Math.max(1, Math.min(100, limit))),
    }, { fetchImpl, signal, timeoutMs });

    const rawAlbums = Array.isArray(payload?.albums)
      ? payload.albums
      : Array.isArray(payload?.topAlbums)
        ? payload.topAlbums
        : Array.isArray(payload?.results)
          ? payload.results
          : [];
    return rawAlbums
      .map((album: any) => ({
        id: String(album?.id || album?.albumid || ''),
        title: decodeHtml(album?.title || album?.name || ''),
        year: album?.year ? String(album.year) : null,
        image: providerImage(album?.image),
      }))
      .filter((album: any) => Boolean(album.id && album.title))
      .slice(0, limit);
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return [];
  }
}
