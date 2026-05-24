import { PlaybackErrorType, type PlaybackErrorTypeValue } from '@/src/lib/playback/playbackErrors';

const NETWORK_BACKOFF_MS = Object.freeze([500, 1500, 3000]);
export const MAX_AUTOMATIC_RECOVERY_ATTEMPTS = 3;

export type PlaybackRecoveryAction =
  | 'ignore'
  | 'await-user'
  | 'await-online'
  | 'refresh-stream'
  | 'fail';

export function getPlaybackRecoveryPolicy(
  errorType: PlaybackErrorTypeValue,
  attempt = 0,
  options: { online?: boolean } = {}
) {
  const online = options.online !== false;

  if (errorType === PlaybackErrorType.REQUEST_ABORTED) return { action: 'ignore' as const, delayMs: 0 };
  if (errorType === PlaybackErrorType.AUTOPLAY_BLOCKED) return { action: 'await-user' as const, delayMs: 0 };
  if (!online && errorType === PlaybackErrorType.NETWORK_ERROR) return { action: 'await-online' as const, delayMs: 0 };
  if (errorType === PlaybackErrorType.AUTH_ERROR || errorType === PlaybackErrorType.RATE_LIMIT) {
    return { action: 'fail' as const, delayMs: 0 };
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
    return {
      action: 'refresh-stream' as const,
      delayMs: attempt === 0 ? 0 : Math.min(1500, 300 * (2 ** attempt)),
    };
  }

  return { action: 'fail' as const, delayMs: 0 };
}
