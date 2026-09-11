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
      quality: supports320 ? '320kbps' : 'unknown',
      bitrate: supports320 ? 320000 : 0,
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
  const abortParent = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortParent, { once: true });

  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
  const targetTitle = normalizeText(target.title);
  const candidateTitle = normalizeText(raw?.title);
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
    const query = [title, target.artist].filter(Boolean).join(' ');
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
