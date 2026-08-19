export type DirectYouTubeMusicSearchTrack = {
  id: string;
  title: string;
  artists: string[];
  album: string | null;
  duration: number | null;
  image: string | null;
};

export type DirectYouTubeMusicStream = DirectYouTubeMusicSearchTrack & {
  url: string;
  headers: Record<string, string>;
  bitrate: number | null;
  codec: string | null;
  mimeType: string | null;
  quality: string | null;
  clientName: string;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type StreamQuality = 'automatic' | 'data-saver' | 'normal' | 'high' | 'maximum';

type YouTubeClient = {
  clientName: string;
  clientId: string;
  clientVersion: string;
  userAgent: string;
  osName?: string;
  osVersion?: string;
  deviceMake?: string;
  deviceModel?: string;
  androidSdkVersion?: number;
};

const YOUTUBE_PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const YOUTUBE_MUSIC_SEARCH_URL = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false';
const VISITOR_BOOTSTRAP_URL = 'https://www.youtube.com/sw.js_data';

const WEB_REMIX_VERSION = '1.20260707.12.00';
const WEB_REMIX_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// Kept deliberately small: these identities are only attempted when the
// higher-priority Harmonia/JioSaavn path could not serve the recording.
// Only clients that commonly return direct URL fields are useful here because
// Harmonia Mobile intentionally does not ship a signature-cipher extractor.
const PLAYER_CLIENTS: YouTubeClient[] = [
  {
    clientName: 'ANDROID_MUSIC',
    clientId: '21',
    clientVersion: '8.39.42',
    userAgent:
      'com.google.android.apps.youtube.music/8.39.42 ' +
      '(Linux; U; Android 15; en_US; Pixel 9 Pro; Build/AP4A.250205.002) gzip',
    osName: 'Android',
    osVersion: '15',
    deviceMake: 'Google',
    deviceModel: 'Pixel 9 Pro',
    androidSdkVersion: 35,
  },
  {
    clientName: 'IOS',
    clientId: '5',
    clientVersion: '21.29.1',
    userAgent:
      'com.google.ios.youtube/21.29.1 ' +
      '(iPhone16,2; U; CPU iOS 18_5 like Mac OS X;)',
    osName: 'iPhone',
    osVersion: '18.5.22F70',
    deviceMake: 'Apple',
    deviceModel: 'iPhone16,2',
  },
  {
    clientName: 'ANDROID_VR',
    clientId: '28',
    clientVersion: '1.65.10',
    userAgent:
      'com.google.android.apps.youtube.vr.oculus/1.65.10 ' +
      '(Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    osName: 'Android',
    osVersion: '12L',
    deviceMake: 'Oculus',
    deviceModel: 'Quest 3',
    androidSdkVersion: 32,
  },
];

let visitorCache: { value: string | null; expiresAt: number } | null = null;

function decodeHtml(value: unknown) {
  return String(value || '')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function normalizeText(value: unknown) {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/i, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseDuration(value: unknown) {
  const text = String(value || '');
  const match = text.match(/\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) && total > 0 ? total : null;
}

function qualityCeiling(quality: StreamQuality) {
  switch (quality) {
    case 'data-saver': return 96_000;
    case 'normal': return 160_000;
    case 'high': return 320_000;
    case 'maximum':
    case 'automatic':
    default:
      return Number.POSITIVE_INFINITY;
  }
}

function codecFromMime(mimeType: string) {
  const match = mimeType.match(/codecs="([^"]+)"/i);
  return match?.[1]?.split(',')?.[0]?.trim() || null;
}

function baseMime(mimeType: string) {
  return mimeType.split(';')[0]?.trim() || null;
}

function imageFromThumbnails(value: any): string | null {
  const thumbnails =
    value?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    value?.thumbnail?.thumbnails ||
    value?.thumbnails;

  if (!Array.isArray(thumbnails) || !thumbnails.length) return null;
  const item = [...thumbnails].reverse().find((entry) => typeof entry?.url === 'string');
  return item?.url ? String(item.url).replace(/^http:\/\//i, 'https://') : null;
}

function textOf(node: any) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node?.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node?.runs)) {
    return node.runs.map((run: any) => String(run?.text || '')).join('').trim();
  }
  return '';
}

function firstWatchVideoId(value: any): string | null {
  if (!value || typeof value !== 'object') return null;
  const direct =
    value?.playlistItemData?.videoId ||
    value?.navigationEndpoint?.watchEndpoint?.videoId ||
    value?.watchEndpoint?.videoId;
  if (typeof direct === 'string' && /^[A-Za-z0-9_-]{11}$/.test(direct)) return direct;

  for (const child of Object.values(value)) {
    if (!child || typeof child !== 'object') continue;
    const found = firstWatchVideoId(child);
    if (found) return found;
  }
  return null;
}

function collectResponsiveItems(value: any, out: any[] = []) {
  if (!value || typeof value !== 'object') return out;
  if (value.musicResponsiveListItemRenderer) {
    out.push(value.musicResponsiveListItemRenderer);
  }
  if (Array.isArray(value)) {
    for (const item of value) collectResponsiveItems(item, out);
  } else {
    for (const child of Object.values(value)) collectResponsiveItems(child, out);
  }
  return out;
}

function rendererTextColumns(renderer: any) {
  return (Array.isArray(renderer?.flexColumns) ? renderer.flexColumns : [])
    .map((column: any) => textOf(column?.musicResponsiveListItemFlexColumnRenderer?.text))
    .map((value: string) => decodeHtml(value).trim())
    .filter(Boolean);
}

function rendererToSearchTrack(renderer: any): DirectYouTubeMusicSearchTrack | null {
  const id = firstWatchVideoId(renderer);
  if (!id) return null;

  const columns = rendererTextColumns(renderer);
  const title = columns[0] || '';
  if (!title) return null;

  const subtitle = columns.slice(1).join(' · ');
  const duration =
    parseDuration(textOf(renderer?.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text)) ||
    parseDuration(subtitle);

  const secondRuns =
    renderer?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
  const artistRuns = Array.isArray(secondRuns)
    ? secondRuns
        .filter((run: any) => {
          const name = String(run?.text || '').trim();
          if (!name || name === '•' || name === '·') return false;
          if (parseDuration(name)) return false;
          const pageType =
            run?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
              ?.browseEndpointContextMusicConfig?.pageType;
          return pageType === 'MUSIC_PAGE_TYPE_ARTIST' ||
            /^UC[A-Za-z0-9_-]+$/.test(String(run?.navigationEndpoint?.browseEndpoint?.browseId || ''));
        })
        .map((run: any) => decodeHtml(run.text).trim())
        .filter(Boolean)
    : [];

  const artists = artistRuns.length
    ? [...new Set(artistRuns)]
    : columns[1]
      ? [columns[1].split(/[•·]/)[0]?.trim()].filter(Boolean) as string[]
      : [];

  let album: string | null = null;
  if (Array.isArray(secondRuns)) {
    const albumRun = secondRuns.find((run: any) =>
      run?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
        ?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_ALBUM'
    );
    if (albumRun?.text) album = decodeHtml(albumRun.text).trim();
  }

  return {
    id,
    title: decodeHtml(title),
    artists,
    album,
    duration,
    image: imageFromThumbnails(renderer),
  };
}

function matchScore(
  candidate: DirectYouTubeMusicSearchTrack,
  target: { title: string; artist?: string | null; duration?: number | null }
) {
  const title = normalizeText(candidate.title);
  const targetTitle = normalizeText(target.title);
  if (!title || !targetTitle) return -1000;

  let score = 0;
  if (title === targetTitle) score += 70;
  else if (title.includes(targetTitle) || targetTitle.includes(title)) score += 45;
  else {
    const a = new Set(title.split(' ').filter(Boolean));
    const b = targetTitle.split(' ').filter(Boolean);
    const hits = b.filter((token) => a.has(token)).length;
    score += b.length ? (hits / b.length) * 35 : 0;
  }

  const artist = normalizeText(candidate.artists.join(' '));
  const targetArtist = normalizeText(target.artist || '');
  if (artist && targetArtist) {
    if (artist === targetArtist) score += 25;
    else if (artist.includes(targetArtist) || targetArtist.includes(artist)) score += 15;
  }

  if (target.duration && candidate.duration) {
    const delta = Math.abs(target.duration - candidate.duration);
    if (delta <= 2) score += 20;
    else if (delta <= 5) score += 12;
    else if (delta <= 10) score += 5;
    else if (delta > 20) score -= 25;
  }

  return score;
}

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal: AbortSignal | undefined,
  timeoutMs: number
) {
  const controller = new AbortController();
  const abortParent = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener('abort', abortParent, { once: true });

  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abortParent);
  }
}

async function visitorData(
  fetchImpl: FetchLike,
  signal?: AbortSignal,
  timeoutMs = 4500
): Promise<string | null> {
  const now = Date.now();
  if (visitorCache && visitorCache.expiresAt > now) return visitorCache.value;

  let value: string | null = null;
  try {
    value = await withTimeout(async (innerSignal) => {
      const response = await fetchImpl(VISITOR_BOOTSTRAP_URL, {
        method: 'GET',
        signal: innerSignal,
        headers: {
          Accept: '*/*',
          'User-Agent': WEB_REMIX_USER_AGENT,
        },
      });
      if (!response.ok) return null;
      const body = await response.text();
      return body.match(/Cg[A-Za-z0-9_%-]{40,}/)?.[0] || null;
    }, signal, timeoutMs);
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
  }

  visitorCache = {
    value,
    expiresAt: now + (value ? 30 * 60_000 : 2 * 60_000),
  };
  return value;
}

export async function searchDirectYouTubeMusic(
  query: string,
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = 7000,
    limit = 10,
  }: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
    limit?: number;
  } = {}
): Promise<DirectYouTubeMusicSearchTrack[]> {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  try {
    const visitor = await visitorData(fetchImpl, signal).catch(() => null);
    const payload = await withTimeout(async (innerSignal) => {
      const response = await fetchImpl(YOUTUBE_MUSIC_SEARCH_URL, {
        method: 'POST',
        signal: innerSignal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: 'https://music.youtube.com',
          Referer: 'https://music.youtube.com/',
          'X-Origin': 'https://music.youtube.com',
          'X-YouTube-Client-Name': '67',
          'X-YouTube-Client-Version': WEB_REMIX_VERSION,
          ...(visitor ? { 'X-Goog-Visitor-Id': visitor } : {}),
          'User-Agent': WEB_REMIX_USER_AGENT,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: WEB_REMIX_VERSION,
              hl: 'en',
              gl: 'IN',
              ...(visitor ? { visitorData: visitor } : {}),
            },
            user: { lockedSafetyMode: false },
            request: { useSsl: true },
          },
          query: cleanQuery,
        }),
      });
      if (!response.ok) return null;
      return response.json().catch(() => null);
    }, signal, timeoutMs);

    if (!payload) return [];
    const seen = new Set<string>();
    const tracks: DirectYouTubeMusicSearchTrack[] = [];
    for (const renderer of collectResponsiveItems(payload)) {
      const track = rendererToSearchTrack(renderer);
      if (!track || seen.has(track.id)) continue;
      seen.add(track.id);
      tracks.push(track);
      if (tracks.length >= Math.max(1, Math.min(30, limit))) break;
    }
    return tracks;
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return [];
  }
}

export async function findDirectYouTubeMusicTrack(
  target: {
    title: string;
    artist?: string | null;
    duration?: number | null;
  },
  options: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
) {
  const query = [target.title, target.artist].filter(Boolean).join(' ').trim();
  if (!query) return null;

  const results = await searchDirectYouTubeMusic(query, {
    ...options,
    limit: 12,
  });
  const ranked = results
    .map((track) => ({ track, score: matchScore(track, target) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score >= 50 ? ranked[0].track : null;
}

function rankFormats(formats: any[], quality: StreamQuality) {
  const ceiling = qualityCeiling(quality);
  const direct = formats
    .filter((format) =>
      typeof format?.url === 'string' &&
      /^https?:\/\//i.test(format.url) &&
      String(format?.mimeType || '').startsWith('audio/')
    )
    .map((format) => ({
      url: String(format.url),
      bitrate: Number(format?.bitrate || format?.averageBitrate || 0) || 0,
      mimeType: String(format?.mimeType || ''),
    }));

  const within = direct
    .filter((format) => !Number.isFinite(ceiling) || !format.bitrate || format.bitrate <= ceiling)
    .sort((a, b) => b.bitrate - a.bitrate);
  const over = direct
    .filter((format) => Number.isFinite(ceiling) && format.bitrate > ceiling)
    .sort((a, b) => a.bitrate - b.bitrate);

  return [...within, ...over];
}

async function probeMedia(
  url: string,
  headers: Record<string, string>,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
  timeoutMs = 4500
) {
  try {
    return await withTimeout(async (innerSignal) => {
      const response = await fetchImpl(url, {
        method: 'GET',
        signal: innerSignal,
        headers: {
          ...headers,
          Range: 'bytes=0-131071',
          Accept: '*/*',
        },
      });
      const ok = response.status === 200 || response.status === 206;
      try {
        await (response.body as any)?.cancel?.();
      } catch {}
      return ok;
    }, signal, timeoutMs);
  } catch (error: any) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return false;
  }
}

export async function resolveDirectYouTubeMusicTrack(
  videoId: string,
  {
    fetchImpl = fetch,
    signal,
    timeoutMs = 6500,
    quality = 'automatic',
  }: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
    quality?: StreamQuality;
  } = {}
): Promise<DirectYouTubeMusicStream | null> {
  const cleanId = String(videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(cleanId)) return null;

  const visitor = await visitorData(fetchImpl, signal).catch(() => null);

  for (const client of PLAYER_CLIENTS) {
    if (signal?.aborted) {
      const aborted = new Error('YouTube Music resolution aborted');
      aborted.name = 'AbortError';
      throw aborted;
    }

    try {
      const payload = await withTimeout(async (innerSignal) => {
        const response = await fetchImpl(YOUTUBE_PLAYER_URL, {
          method: 'POST',
          signal: innerSignal,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': client.userAgent,
            'X-YouTube-Client-Name': client.clientId,
            'X-YouTube-Client-Version': client.clientVersion,
            ...(visitor ? { 'X-Goog-Visitor-Id': visitor } : {}),
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: client.clientName,
                clientVersion: client.clientVersion,
                hl: 'en',
                gl: 'IN',
                ...(client.osName ? { osName: client.osName } : {}),
                ...(client.osVersion ? { osVersion: client.osVersion } : {}),
                ...(client.deviceMake ? { deviceMake: client.deviceMake } : {}),
                ...(client.deviceModel ? { deviceModel: client.deviceModel } : {}),
                ...(client.androidSdkVersion
                  ? { androidSdkVersion: client.androidSdkVersion }
                  : {}),
                ...(visitor ? { visitorData: visitor } : {}),
              },
            },
            videoId: cleanId,
            contentCheckOk: true,
            racyCheckOk: true,
          }),
        });
        if (!response.ok) return null;
        return response.json().catch(() => null);
      }, signal, timeoutMs);

      if (!payload || payload?.playabilityStatus?.status !== 'OK') continue;

      const formats = rankFormats(
        Array.isArray(payload?.streamingData?.adaptiveFormats)
          ? payload.streamingData.adaptiveFormats
          : [],
        quality
      );
      if (!formats.length) continue;

      const headers = { 'User-Agent': client.userAgent };
      for (const format of formats) {
        const playable = await probeMedia(format.url, headers, fetchImpl, signal);
        if (!playable) continue;

        const details = payload?.videoDetails || {};
        const duration = Number(details?.lengthSeconds || 0);
        const bitrate = format.bitrate || null;
        const mimeType = baseMime(format.mimeType);
        const codec = codecFromMime(format.mimeType);

        return {
          id: cleanId,
          title: decodeHtml(details?.title || ''),
          artists: details?.author ? [decodeHtml(details.author)] : [],
          album: null,
          duration: Number.isFinite(duration) && duration > 0 ? duration : null,
          image: imageFromThumbnails(details),
          url: format.url,
          headers,
          bitrate,
          codec,
          mimeType,
          quality: bitrate ? `${Math.round(bitrate / 1000)}kbps` : null,
          clientName: client.clientName,
        };
      }
    } catch (error: any) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
    }
  }

  return null;
}
