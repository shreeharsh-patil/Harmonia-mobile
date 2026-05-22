import {
  resolvePlayableSong,
  type ResolvedStreamDiagnostics,
  type StreamQuality,
} from '@/src/lib/api';
import { HARMONIA_API_URL } from '@/src/config';
import type { Song } from '@/src/types';

export type AdaptivePipelineStatus =
  | 'idle'
  | 'starting'
  | 'playing-fast'
  | 'upgrading'
  | 'upgraded'
  | 'upgrade-skipped'
  | 'upgrade-failed';

export type PipelineResolvedStream = {
  song: Song;
  url: string;
  diagnostics: ResolvedStreamDiagnostics;
  requestedQuality: StreamQuality;
  resolvedAt: number;
  resolveMs: number;
};

export type AdaptivePipelinePlan = {
  initial: PipelineResolvedStream;
  promotion: Promise<PipelineResolvedStream | null>;
  startQuality: StreamQuality;
  targetQuality: StreamQuality;
};

const QUALITY_RANK: Record<StreamQuality, number> = {
  'data-saver': 0,
  normal: 1,
  automatic: 2,
  high: 3,
  maximum: 4,
};

function parseBitrate(value: number | null, quality: string | null) {
  if (value && Number.isFinite(value)) return value;
  const text = String(quality || '').toLowerCase();
  const match = text.match(/(\d{2,4})\s*k(?:bps)?/);
  return match ? Number(match[1]) * 1000 : 0;
}

export function fastStartQuality(target: StreamQuality): StreamQuality {
  switch (target) {
    case 'maximum':
    case 'high':
      return 'normal';
    case 'automatic':
      return 'data-saver';
    default:
      return target;
  }
}

export function isMeaningfulPromotion(
  initial: PipelineResolvedStream,
  candidate: PipelineResolvedStream
) {
  if (initial.url === candidate.url) return false;

  const initialBitrate = parseBitrate(
    initial.diagnostics.bitrate,
    initial.diagnostics.quality
  );
  const candidateBitrate = parseBitrate(
    candidate.diagnostics.bitrate,
    candidate.diagnostics.quality
  );

  if (candidateBitrate && initialBitrate) {
    return candidateBitrate > initialBitrate;
  }

  return QUALITY_RANK[candidate.requestedQuality] >
    QUALITY_RANK[initial.requestedQuality];
}

function fallbackYoutubeId(song: Song) {
  const raw = song as any;
  const candidate = String(raw.videoId || raw.youtubeId || '').trim();
  return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
}

function hostOf(url: string) {
  try {
    return new URL(url, HARMONIA_API_URL).host || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function resolveTimed(song: Song, quality: StreamQuality) {
  const started = Date.now();
  try {
    const resolved = await resolvePlayableSong(song, quality);
    return {
      ...resolved,
      requestedQuality: quality,
      resolvedAt: Date.now(),
      resolveMs: Date.now() - started,
    } satisfies PipelineResolvedStream;
  } catch (primaryError) {
    const youtubeId = fallbackYoutubeId(song);
    if (!youtubeId) throw primaryError;

    const url = `${HARMONIA_API_URL}/api/yt-stream?id=${encodeURIComponent(youtubeId)}`;
    return {
      song,
      url,
      diagnostics: {
        provider: 'YouTube fallback',
        source: 'proxy',
        codec: null,
        bitrate: null,
        quality: quality === 'automatic' ? 'adaptive' : quality,
        streamHost: hostOf(url),
      },
      requestedQuality: quality,
      resolvedAt: Date.now(),
      resolveMs: Date.now() - started,
    } satisfies PipelineResolvedStream;
  }
}

export async function createAdaptivePipeline(
  song: Song,
  targetQuality: StreamQuality
): Promise<AdaptivePipelinePlan> {
  const startQuality = fastStartQuality(targetQuality);
  const initial = await resolveTimed(song, startQuality);

  const promotion =
    startQuality === targetQuality
      ? Promise.resolve(null)
      : resolveTimed(song, targetQuality)
          .then((candidate) =>
            isMeaningfulPromotion(initial, candidate) ? candidate : null
          )
          .catch(() => null);

  return {
    initial,
    promotion,
    startQuality,
    targetQuality,
  };
}
