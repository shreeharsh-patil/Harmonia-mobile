import { PlaybackErrorType, type PlaybackErrorTypeValue } from '@/src/lib/playback/playbackErrors';

const NETWORK_BACKOFF_MS = Object.freeze([500, 1500, 3000]);
export const MAX_AUTOMATIC_RECOVERY_ATTEMPTS = 3;

export type PlaybackRecoveryAction =
  | 'ignore'
  | 'await-user'
  | 'await-online'
  | 'next-candidate'
  | 'refresh-stream'
  | 'fail';

export function nextUntriedCandidateIndex(
  candidates: readonly { url: string }[],
  failedUrls: ReadonlySet<string>
) {
  return candidates.findIndex((candidate) => {
    const url = String(candidate?.url || '').trim();
    return Boolean(url) && !failedUrls.has(url);
  });
}

export function getPlaybackRecoveryPolicy(
  errorType: PlaybackErrorTypeValue,
  attempt = 0,
  options: { online?: boolean; hasNextCandidate?: boolean } = {}
) {
  const online = options.online !== false;
  const hasNextCandidate = options.hasNextCandidate === true;

  if (errorType === PlaybackErrorType.REQUEST_ABORTED) return { action: 'ignore' as const, delayMs: 0 };
  if (errorType === PlaybackErrorType.AUTOPLAY_BLOCKED) return { action: 'await-user' as const, delayMs: 0 };
  if (!online && errorType === PlaybackErrorType.NETWORK_ERROR) return { action: 'await-online' as const, delayMs: 0 };
  if (errorType === PlaybackErrorType.AUTH_ERROR || errorType === PlaybackErrorType.RATE_LIMIT) {
    return { action: 'fail' as const, delayMs: 0 };
  }

  if (
    (errorType === PlaybackErrorType.AUDIO_DECODING_ERROR ||
      errorType === PlaybackErrorType.TRACK_UNAVAILABLE ||
      errorType === PlaybackErrorType.INVALID_STREAM_URL ||
      errorType === PlaybackErrorType.STREAM_URL_EXPIRED ||
      errorType === PlaybackErrorType.PLAYER_NOT_READY ||
      errorType === PlaybackErrorType.PROVIDER_ERROR ||
      errorType === PlaybackErrorType.UNKNOWN) &&
    hasNextCandidate
  ) {
    return { action: 'next-candidate' as const, delayMs: 0 };
  }

  if (errorType === PlaybackErrorType.NETWORK_ERROR && attempt < NETWORK_BACKOFF_MS.length) {
    return { action: 'refresh-stream' as const, delayMs: NETWORK_BACKOFF_MS[attempt] };
  }

  if (
    (errorType === PlaybackErrorType.STREAM_URL_EXPIRED ||
      errorType === PlaybackErrorType.AUDIO_DECODING_ERROR ||
      errorType === PlaybackErrorType.TRACK_UNAVAILABLE ||
      errorType === PlaybackErrorType.INVALID_STREAM_URL ||
      errorType === PlaybackErrorType.PLAYER_NOT_READY ||
      errorType === PlaybackErrorType.PROVIDER_ERROR ||
      errorType === PlaybackErrorType.UNKNOWN) &&
    attempt < MAX_AUTOMATIC_RECOVERY_ATTEMPTS
  ) {
    const fallbackBackoffMs = [0, 500, 1500] as const;
    return {
      action: 'refresh-stream' as const,
      delayMs: fallbackBackoffMs[Math.min(attempt, fallbackBackoffMs.length - 1)],
    };
  }

  return { action: 'fail' as const, delayMs: 0 };
}

export function captureRecoveryPosition(...values: (number | null | undefined)[]) {
  return Math.max(
    0,
    ...values.map((value) => {
      const number = Number(value || 0);
      return Number.isFinite(number) ? number : 0;
    })
  );
}
