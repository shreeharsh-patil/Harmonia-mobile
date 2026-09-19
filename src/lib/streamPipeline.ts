import type { Song } from '@/src/types';
import {
  resolveTrackStream,
  type ResolveTrackOptions,
  type ResolvedStreamDiagnostics,
  type StreamQuality,
} from '@/src/lib/playback/streamResolver';

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
  headers: Record<string, string> | null;
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

function bitrate(value: number | null, quality: string | null) {
  if (value && Number.isFinite(value)) return value;
  const text = String(quality || '').toLowerCase();
  if (/(lossless|flac|alac|wav)/.test(text)) return 10_000_000;
  const match = text.match(/(\d{2,4})\s*k(?:bps)?/) || text.match(/(\d{2,4})/);
  return match ? Number(match[1]) * 1000 : 0;
}

export function fastStartQuality(target: StreamQuality): StreamQuality {
  switch (target) {
    case 'maximum':
      // Start a large lossless/highest-quality request at a stream that is
      // quick to open. The pipeline promotes it after audio is already
      // playing, avoiding a long first-buffer pause on slower devices.
      return 'high';
    case 'high':
      return 'normal';
    case 'normal':
    case 'data-saver':
      return target;
    case 'automatic':
    default:
      return 'normal';
  }
}

export function isMeaningfulPromotion(
  initial: PipelineResolvedStream,
  candidate: PipelineResolvedStream
) {
  if (initial.url === candidate.url) return false;

  const initialBitrate = bitrate(
    initial.diagnostics.bitrate,
    initial.diagnostics.quality
  );
  const candidateBitrate = bitrate(
    candidate.diagnostics.bitrate,
    candidate.diagnostics.quality
  );

  if (candidateBitrate && initialBitrate) {
    return candidateBitrate > initialBitrate;
  }

  return QUALITY_RANK[candidate.requestedQuality] >
    QUALITY_RANK[initial.requestedQuality];
}

async function resolveTimed(
  song: Song,
  quality: StreamQuality,
  options: Omit<ResolveTrackOptions, 'quality'> = {}
): Promise<PipelineResolvedStream> {
  const started = Date.now();
  const resolved = await resolveTrackStream(song, {
    ...options,
    quality,
  });

  return {
    song: resolved.track,
    url: resolved.url,
    diagnostics: resolved.diagnostics,
    headers: resolved.headers,
    requestedQuality: quality,
    resolvedAt: resolved.resolvedAt,
    resolveMs: Date.now() - started,
  };
}

export async function createAdaptivePipeline(
  song: Song,
  targetQuality: StreamQuality,
  options: Omit<ResolveTrackOptions, 'quality'> = {}
): Promise<AdaptivePipelinePlan> {
  const startQuality = fastStartQuality(targetQuality);
  const initial = await resolveTimed(song, startQuality, options);

  const promotion =
    startQuality === targetQuality
      ? Promise.resolve(null)
      : resolveTimed(song, targetQuality, {
          ...options,
          forceFresh: false,
        })
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
