import { HARMONIA_API_URL, HARMONIA_STREAM_API_URL } from '@/src/config';
import { artistNames, normalizeSong } from '@/src/lib/song';
import type { Song } from '@/src/types';
import {
  PlaybackErrorType,
  PlaybackPipelineError,
  classifyHttpError,
  classifyPlaybackError,
} from '@/src/lib/playback/playbackErrors';
import { providerHealth, type ProviderHealthManager } from '@/src/lib/playback/providerHealth';
import {
  ResolvedStreamMemoryCache,
  getStreamExpiresAt,
} from '@/src/lib/playback/streamCache';
import {
  fetchDirectJioSaavnTrack,
  findDirectJioSaavnTrack,
} from '@/src/lib/playback/jiosaavnDirect';

export { isResolvedStreamFresh } from '@/src/lib/playback/streamCache';
import { streamHostname } from '@/src/lib/playback/streamDiagnostics';

export type StreamQuality = 'automatic' | 'data-saver' | 'normal' | 'high' | 'maximum';
export type StreamResolverProviderId = 'embedded' | 'youtube' | 'jiosaavn' | 'backend-search';

export type ResolvedStreamDiagnostics = {
  provider: string;
  source: StreamResolverProviderId;
  codec: string | null;
  bitrate: number | null;
  quality: string | null;
  mimeType: string | null;
  streamHost: string;
  resolutionTimeMs: number | null;
  cache: 'hit' | 'miss';
  expiresAt: number | null;
  recoveryAttempt?: number | null;
};

export type ResolvedStream = {
  trackId: string;
  url: string;
  provider: string;
  source: StreamResolverProviderId;
  mimeType: string | null;
  codec: string | null;
  bitrate: number | null;
  quality: string | null;
  resolvedAt: number;
  expiresAt: number;
  track: Song;
  cache: 'hit' | 'miss';
  resolutionTimeMs: number;
  diagnostics: ResolvedStreamDiagnostics;
};

export type ResolveTrackOptions = {
  quality?: StreamQuality;
  forceFresh?: boolean;
  excludeProviders?: string[];
  signal?: AbortSignal;
  priority?: 'high' | 'medium' | 'low';
  recoveryAttempt?: number | null;
  skipEmbedded?: boolean;
};

type AudioCandidate = {
  url: string;
  quality: string | null;
  bitrate: number | null;
  codec: string | null;
  mimeType: string | null;
  lossless: boolean;
};

type ProviderResult = {
  url: string;
  track?: Song;
  provider?: string;
  codec?: string | null;
  bitrate?: number | null;
  quality?: string | null;
  mimeType?: string | null;
};

export type StreamProvider = {
  id: StreamResolverProviderId;
  canResolve: (track: Song, options: ResolveTrackOptions) => boolean;
  resolve: (track: Song, options: ResolveTrackOptions) => Promise<ProviderResult>;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const TEMPORARY_PAGE_PATTERNS = [
  /open\.spotify\.com/i,
  /youtube\.com\/watch/i,
  /youtu\.be\//i,
  /jiosaavn\.com\/(song|album|artist)\//i,
  /\.html?(?:$|[?#])/i,
];

function absoluteUrl(value: string, base = HARMONIA_API_URL) {
  try {
    return base ? new URL(value, base).href : new URL(value).href;
  } catch {
    return value;
  }
}

export function isValidAudioUrl(value: unknown) {
  if (!value || typeof value !== 'string') return false;
  const url = value.trim();
  if (!url) return false;
  if (TEMPORARY_PAGE_PATTERNS.some((pattern) => pattern.test(url))) return false;
  if (/^(file|content):\/\//i.test(url)) return true;
  if (/^(blob:|data:audio\/)/i.test(url)) return true;
  if (/^https?:\/\//i.test(url)) return true;
  if (/^\/api\/(?:yt-stream|stream|proxy\/audio)/i.test(url)) return true;
  return false;
}

export function inferStreamProvider(url: string, track?: Song) {
  const value = String(url || '').toLowerCase();
  if (value.includes('/api/yt-stream') || value.includes('googlevideo.com')) return 'youtube';
  if (value.includes('saavncdn.com') || value.includes('/api/songs/')) return 'jiosaavn';
  if (
    value.includes('/api/stream-track') ||
    value.includes('piped') ||
    value.includes('youtube-nocookie')
  ) {
    return 'backend-search';
  }
  return String((track as any)?.provider || (track as any)?.source || 'direct').toLowerCase();
}

function parseNumericBitrate(value: unknown) {
  const number = Number(value || 0);
  if (Number.isFinite(number) && number > 0) {
    return number > 5000 ? Math.round(number) : Math.round(number * 1000);
  }
  return 0;
}

function candidateBitrate(item: any) {
  const direct = parseNumericBitrate(item?.bitrate);
  if (direct) return direct;

  const label = String(item?.quality || item?.codec || '').toLowerCase();
  const match = label.match(/(\d{2,4})\s*k(?:bps)?/i) || label.match(/(\d{2,4})/);
  return match ? Number(match[1]) * 1000 : 0;
}

function isLosslessCandidate(item: any) {
  const label = [
    item?.quality,
    item?.codec,
    item?.mimeType,
    item?.format,
  ].filter(Boolean).join(' ').toLowerCase();
  return /(lossless|flac|alac|wav)/.test(label);
}

function qualityCeiling(quality: StreamQuality) {
  switch (quality) {
    case 'data-saver': return 96_000;
    case 'normal': return 160_000;
    case 'high': return 320_000;
    case 'maximum': return Number.POSITIVE_INFINITY;
    case 'automatic':
    default:
      return Number.POSITIVE_INFINITY;
  }
}

function candidateScore(candidate: AudioCandidate) {
  if (candidate.lossless) return 10_000_000 + Number(candidate.bitrate || 0);
  return Number(candidate.bitrate || 1);
}

function normalizeCandidate(item: any): AudioCandidate | null {
  const url = typeof item === 'string'
    ? item
    : item?.url || item?.link || item?.downloadUrl || item?.src;

  if (!isValidAudioUrl(url)) return null;

  return {
    url: String(url),
    quality: item && typeof item === 'object' ? String(item.quality || '') || null : null,
    bitrate: item && typeof item === 'object' ? candidateBitrate(item) || null : null,
    codec: item && typeof item === 'object' ? String(item.codec || '') || null : null,
    mimeType: item && typeof item === 'object' ? String(item.mimeType || '') || null : null,
    lossless: item && typeof item === 'object' ? isLosslessCandidate(item) : false,
  };
}

export function getAudioCandidates(track: Song | Record<string, any> | null | undefined, quality: StreamQuality = 'automatic') {
  if (!track) return [] as AudioCandidate[];

  const raw = track as Record<string, any>;
  const candidates: AudioCandidate[] = [];
  const seen = new Set<string>();
  const add = (value: any) => {
    const candidate = normalizeCandidate(value);
    if (!candidate) return;
    const normalized = absoluteUrl(candidate.url);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(candidate);
  };

  if (Array.isArray(raw.downloadUrl)) raw.downloadUrl.forEach(add);

  for (const key of [
    'downloadUrl',
    'media_url',
    'mediaUrl',
    'audioUrl',
    'audio_url',
    'stream_url',
    'streamUrl',
    'playbackUrl',
    'url',
  ]) {
    const value = raw[key];
    if (Array.isArray(value)) value.forEach(add);
    else add(value);
  }

  const ceiling = qualityCeiling(quality);
  const sorted = [...candidates].sort((a, b) => candidateScore(b) - candidateScore(a));

  if (!Number.isFinite(ceiling)) return sorted;

  const within = sorted.filter((candidate) => {
    if (candidate.lossless) return false;
    return !candidate.bitrate || candidate.bitrate <= ceiling;
  });
  const above = sorted.filter((candidate) => !within.includes(candidate));

  if (within.length) return [...within, ...above];

  return [...sorted].sort((a, b) => {
    const aRate = a.bitrate || Number.MAX_SAFE_INTEGER;
    const bRate = b.bitrate || Number.MAX_SAFE_INTEGER;
    return aRate - bRate;
  });
}

export function describeStreamCandidate(
  track: Song | Record<string, any>,
  urlOrCandidate: string | AudioCandidate
) {
  const candidate = typeof urlOrCandidate === 'string'
    ? getAudioCandidates(track, 'maximum').find((item) => absoluteUrl(item.url) === absoluteUrl(urlOrCandidate))
    : urlOrCandidate;

  const url = typeof urlOrCandidate === 'string' ? urlOrCandidate : urlOrCandidate.url;

  return {
    provider: inferStreamProvider(url, track as Song),
    bitrate: candidate?.bitrate || null,
    codec: candidate?.codec || null,
    mimeType: candidate?.mimeType || null,
    quality: candidate?.quality || null,
  };
}

export function getImmediateLocalSource(song: Song, offlineUri?: string | null) {
  const localUri = typeof (song as any).localUri === 'string'
    ? String((song as any).localUri)
    : null;

  if (localUri && isValidAudioUrl(localUri)) {
    return { url: localUri, source: 'local' as const };
  }

  if (offlineUri && isValidAudioUrl(offlineUri)) {
    return { url: offlineUri, source: 'offline' as const };
  }

  return null;
}

function youtubeIdOf(track: Song) {
  const raw = track as any;
  const explicit = String(raw.videoId || raw.youtubeId || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(explicit)) return explicit;

  const source = String(raw.source || raw.provider || '').toLowerCase();
  const id = String(raw.id || raw.songId || '').trim();
  return /youtube|podcast/.test(source) && /^[A-Za-z0-9_-]{11}$/.test(id)
    ? id
    : null;
}

function jioSaavnIdOf(track: Song) {
  const source = String((track as any).source || (track as any).provider || '').toLowerCase();
  if (!source.includes('saavn') && !source.includes('jio')) return null;
  const id = String(track.id || (track as any).songId || '').trim();
  return id || null;
}

function canResolveWithDirectJioSaavn(track: Song) {
  const source = String((track as any).source || (track as any).provider || '').toLowerCase();
  if (source.includes('youtube') || source.includes('podcast')) return false;
  if (jioSaavnIdOf(track)) return true;

  const title = String(track.name || track.title || '').trim();
  const artists = artistNames(track).trim();
  return Boolean(title && artists && artists !== 'Unknown artist');
}

async function fetchJson(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  parentSignal?: AbortSignal,
  timeoutMs = 12_000
) {
  const controller = new AbortController();
  let timedOut = false;
  const abortParent = () => controller.abort();

  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener('abort', abortParent, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new PlaybackPipelineError(
        classifyHttpError(response.status, data),
        data?.error || data?.message || `HTTP ${response.status}`,
        { status: response.status }
      );
    }

    return data;
  } catch (error) {
    if (timedOut) {
      throw new PlaybackPipelineError(
        PlaybackErrorType.NETWORK_ERROR,
        'Stream resolution timed out.',
        { cause: error }
      );
    }
    throw classifyPlaybackError(error);
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abortParent);
  }
}

function firstSongFromPayload(payload: any) {
  if (Array.isArray(payload?.data)) return payload.data[0] || null;
  if (Array.isArray(payload?.data?.results)) return payload.data.results[0] || null;
  if (Array.isArray(payload?.results)) return payload.results[0] || null;
  if (payload?.data && typeof payload.data === 'object') return payload.data;
  return null;
}

export function createHarmoniaProviders({
  fetchImpl = fetch,
  apiBase = HARMONIA_API_URL,
  streamApiBase = HARMONIA_STREAM_API_URL,
}: {
  fetchImpl?: FetchLike;
  apiBase?: string;
  streamApiBase?: string;
} = {}): StreamProvider[] {
  return [
    {
      id: 'embedded',
      canResolve(track, options) {
        return options.skipEmbedded !== true &&
          getAudioCandidates(track, options.quality || 'automatic').length > 0;
      },
      async resolve(track, options) {
        const candidate = getAudioCandidates(track, options.quality || 'automatic')[0];
        if (!candidate) {
          throw new PlaybackPipelineError(
            PlaybackErrorType.INVALID_STREAM_URL,
            'Embedded track metadata contains no playable audio URL.',
            { provider: 'embedded' }
          );
        }
        return {
          url: candidate.url,
          track,
          provider: inferStreamProvider(candidate.url, track),
          codec: candidate.codec,
          bitrate: candidate.bitrate,
          quality: candidate.quality,
          mimeType: candidate.mimeType,
        };
      },
    },
    {
      id: 'youtube',
      canResolve(track) {
        return Boolean(apiBase && youtubeIdOf(track));
      },
      async resolve(track) {
        const videoId = youtubeIdOf(track);
        if (!videoId) {
          throw new PlaybackPipelineError(
            PlaybackErrorType.TRACK_UNAVAILABLE,
            'Track does not contain a valid YouTube video id.',
            { provider: 'youtube' }
          );
        }

        return {
          url: `${apiBase}/api/yt-stream?id=${encodeURIComponent(videoId)}`,
          track,
          provider: 'youtube',
          quality: 'server-selected',
          mimeType: null,
          codec: null,
          bitrate: null,
        };
      },
    },
    {
      id: 'jiosaavn',
      canResolve(track) {
        return canResolveWithDirectJioSaavn(track);
      },
      async resolve(track, options) {
        const directId = jioSaavnIdOf(track);
        const title = String(track.name || track.title || '').trim();
        const artists = artistNames(track).trim();

        const direct = directId
          ? await fetchDirectJioSaavnTrack(directId, {
              fetchImpl,
              signal: options.signal,
            })
          : await findDirectJioSaavnTrack({
              title,
              artist: artists,
              duration: Number(track.duration || 0) || null,
            }, {
              fetchImpl,
              signal: options.signal,
            });

        if (!direct) {
          throw new PlaybackPipelineError(
            PlaybackErrorType.TRACK_UNAVAILABLE,
            'JioSaavn could not match this recording directly.',
            { provider: 'jiosaavn' }
          );
        }

        const detailed = normalizeSong({
          ...track,
          id: direct.id,
          songId: direct.id,
          name: direct.title || track.name,
          title: direct.title || track.title || track.name,
          artist: direct.artists.join(', ') || (track as any).artist,
          duration: direct.duration || track.duration,
          image: direct.image
            ? [{ quality: '500x500', url: direct.image }]
            : track.image,
          source: 'jiosaavn',
          provider: 'jiosaavn',
          downloadUrl: direct.candidates,
        } as any);

        const candidate = getAudioCandidates(detailed, options.quality || 'automatic')[0];
        if (!candidate) {
          throw new PlaybackPipelineError(
            PlaybackErrorType.INVALID_STREAM_URL,
            'Direct JioSaavn metadata contained no playable audio stream.',
            { provider: 'jiosaavn' }
          );
        }

        return {
          url: candidate.url,
          track: detailed,
          provider: 'jiosaavn',
          codec: candidate.codec,
          bitrate: candidate.bitrate,
          quality: candidate.quality,
          mimeType: candidate.mimeType,
        };
      },
    },
    {
      id: 'backend-search',
      canResolve(track) {
        const title = String(track.name || track.title || '').trim();
        const artists = artistNames(track).trim();
        return Boolean(streamApiBase && title && artists && artists !== 'Unknown artist');
      },
      async resolve(track, options) {
        const title = String(track.name || track.title || '').trim();
        const artists = artistNames(track).trim();

        const payload = await fetchJson(
          fetchImpl,
          `${streamApiBase}/api/stream-track`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title, artists }),
          },
          options.signal,
          18_000
        );

        if (!payload?.streamUrl || !isValidAudioUrl(payload.streamUrl)) {
          throw new PlaybackPipelineError(
            PlaybackErrorType.INVALID_STREAM_URL,
            'Backend search returned no playable stream.',
            { provider: 'backend-search' }
          );
        }

        return {
          url: String(payload.streamUrl),
          track,
          provider: 'backend-search',
          codec: null,
          bitrate: null,
          quality: null,
          mimeType: String(payload.mimeType || '') || null,
        };
      },
    },
  ];
}

function sourceOrderForTrack(track: Song, providers: StreamProvider[]) {
  const map = new Map(providers.map((provider) => [provider.id, provider]));
  const order: StreamResolverProviderId[] = ['embedded'];

  // Resolve on-device with JioSaavn before any optional server fallback.
  // This also lets metadata-only imports (for example Spotify playlist rows)
  // match a playable JioSaavn recording without a Harmonia deployment.
  if (canResolveWithDirectJioSaavn(track)) order.push('jiosaavn');

  if (youtubeIdOf(track)) order.push('youtube');

  order.push('backend-search');

  return order
    .map((id) => map.get(id))
    .filter((provider): provider is StreamProvider => Boolean(provider));
}

export class StreamResolver {
  private cache: ResolvedStreamMemoryCache<ResolvedStream>;

  constructor(
    private providers = createHarmoniaProviders(),
    private options: {
      healthManager?: ProviderHealthManager;
      now?: () => number;
      maxCacheSize?: number;
    } = {}
  ) {
    this.cache = new ResolvedStreamMemoryCache<ResolvedStream>(
      options.maxCacheSize,
      options.now || Date.now
    );
  }

  private get health() {
    return this.options.healthManager || providerHealth;
  }

  private now() {
    return (this.options.now || Date.now)();
  }

  invalidate(trackId: string) {
    this.cache.invalidate(trackId);
  }

  clear() {
    this.cache.clear();
  }

  async resolve(trackInput: Song, options: ResolveTrackOptions = {}): Promise<ResolvedStream> {
    const track = normalizeSong(trackInput as any);
    if (!track?.id && !(track as any).videoId && !(track as any).youtubeId) {
      throw new PlaybackPipelineError(
        PlaybackErrorType.TRACK_UNAVAILABLE,
        'Track is missing stable playback identity.'
      );
    }

    const trackId = String(track.id || (track as any).songId || (track as any).videoId || (track as any).youtubeId);
    const quality = options.quality || 'automatic';
    const cached = this.cache.get(trackId, quality);

    if (!options.forceFresh && cached) {
      const hit = {
        ...cached,
        cache: 'hit' as const,
        resolutionTimeMs: 0,
        diagnostics: {
          ...cached.diagnostics,
          cache: 'hit' as const,
          resolutionTimeMs: 0,
          recoveryAttempt: options.recoveryAttempt ?? null,
        },
      };
      return hit;
    }

    if (options.forceFresh) this.cache.invalidate(trackId);

    const excluded = new Set((options.excludeProviders || []).map((value) => String(value).toLowerCase()));
    const errors: Array<{ provider: string; type: string; status: number; message: string }> = [];

    for (const provider of sourceOrderForTrack(track, this.providers)) {
      if (excluded.has(provider.id)) continue;
      if (!provider.canResolve(track, options)) continue;
      if (provider.id !== 'embedded' && !this.health.isAvailable(provider.id)) continue;

      const startedAt = this.now();

      try {
        if (options.signal?.aborted) {
          const aborted = new Error('Playback resolution aborted');
          aborted.name = 'AbortError';
          throw aborted;
        }

        const value = await provider.resolve(track, options);

        if (!value?.url || !isValidAudioUrl(value.url)) {
          throw new PlaybackPipelineError(
            PlaybackErrorType.INVALID_STREAM_URL,
            'Provider returned an invalid audio URL.',
            { provider: provider.id }
          );
        }

        const actualProvider = String(value.provider || inferStreamProvider(value.url, track)).toLowerCase();
        if (excluded.has(actualProvider)) continue;

        const resolvedAt = this.now();
        const resolutionTimeMs = Math.max(0, resolvedAt - startedAt);
        const expiresAt = getStreamExpiresAt(value.url, resolvedAt);
        const resolvedTrack = normalizeSong((value.track || track) as any);

        const result: ResolvedStream = {
          trackId,
          url: absoluteUrl(value.url),
          provider: actualProvider,
          source: provider.id,
          mimeType: value.mimeType || null,
          codec: value.codec || null,
          bitrate: value.bitrate || null,
          quality: value.quality || null,
          resolvedAt,
          expiresAt,
          track: resolvedTrack,
          cache: 'miss',
          resolutionTimeMs,
          diagnostics: {
            provider: actualProvider,
            source: provider.id,
            codec: value.codec || null,
            bitrate: value.bitrate || null,
            quality: value.quality || null,
            mimeType: value.mimeType || null,
            streamHost: streamHostname(value.url),
            resolutionTimeMs,
            cache: 'miss',
            expiresAt,
            recoveryAttempt: options.recoveryAttempt ?? null,
          },
        };

        if (provider.id !== 'embedded') {
          this.health.recordSuccess(provider.id, resolutionTimeMs);
        }

        this.cache.set(trackId, quality, result);
        return result;
      } catch (error) {
        const typed = classifyPlaybackError(error);
        if (typed.type === PlaybackErrorType.REQUEST_ABORTED) throw typed;

        if (provider.id !== 'embedded') this.health.recordFailure(provider.id);

        errors.push({
          provider: provider.id,
          type: typed.type,
          status: typed.status,
          message: typed.message,
        });
      }
    }

    const last = errors[errors.length - 1];
    throw new PlaybackPipelineError(
      last?.type as any || PlaybackErrorType.TRACK_UNAVAILABLE,
      'All available playback providers failed for this track.',
      {
        status: last?.status || 0,
        provider: last?.provider || null,
        cause: errors,
      }
    );
  }
}

let defaultResolver: StreamResolver | null = null;

export function getStreamResolver() {
  if (!defaultResolver) defaultResolver = new StreamResolver();
  return defaultResolver;
}

export function resolveTrackStream(track: Song, options?: ResolveTrackOptions) {
  return getStreamResolver().resolve(track, options);
}

export function invalidateResolvedStream(trackId: string) {
  getStreamResolver().invalidate(trackId);
}

export function clearResolvedStreamCache() {
  getStreamResolver().clear();
}
