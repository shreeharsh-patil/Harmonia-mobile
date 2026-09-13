import CryptoJS from 'crypto-js';

export type DirectSaavnCandidate = {
  url: string;
  quality: string;
  bitrate: number;
  codec: 'aac';
  mimeType: 'audio/mp4';
};

export type DirectSaavnTrack = {
  id: string;
  title: string;
  album: string | null;
  artists: string[];
  duration: number | null;
  image: string | null;
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

function decryptMediaUrl(encrypted: string) {
  if (!encrypted) return null;

  try {
    const ciphertext = CryptoJS.enc.Base64.parse(encrypted);
    const key = CryptoJS.enc.Utf8.parse(DES_KEY);
    const result = CryptoJS.DES.decrypt(
      { ciphertext } as CryptoJS.lib.CipherParams,
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

  if (supports320) {
    values.set(320, url.replace(match[0], `_320.${extension}`));
    values.set(160, url.replace(match[0], `_160.${extension}`));
    values.set(96, url.replace(match[0], `_96.${extension}`));
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

  const controller = new AbortController();
  const abortParent = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortParent, { once: true });

  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const params = new URLSearchParams({
      __call: 'song.getDetails',
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'android',
      pids: cleanId,
    });

    const response = await fetchImpl(`${JIOSAAVN_API_URL}?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-IN,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/134 Mobile Safari/537.36',
      },
    });

    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    const raw: any = firstSong(payload, cleanId);
    const moreInfo = raw?.more_info || {};
    const decrypted = decryptMediaUrl(String(moreInfo.encrypted_media_url || ''));
    if (!decrypted) return null;

    const primaryArtists = Array.isArray(moreInfo?.artistMap?.primary_artists)
      ? moreInfo.artistMap.primary_artists
          .map((artist: any) => decodeHtml(artist?.name))
          .filter(Boolean)
      : [];

    const duration = Number(moreInfo.duration || 0);

    return {
      id: String(raw.id || cleanId),
      title: decodeHtml(raw.title || ''),
      album: moreInfo.album ? decodeHtml(moreInfo.album) : null,
      artists: primaryArtists,
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      image: typeof raw.image === 'string' ? raw.image.replace(/150x150|50x50/g, '500x500') : null,
      candidates: streamCandidates(
        decrypted,
        String(moreInfo['320kbps'] || '').toLowerCase() === 'true'
      ),
    };
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortParent);
  }
}
