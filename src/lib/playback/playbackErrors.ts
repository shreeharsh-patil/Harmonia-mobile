import { safeErrorMessage } from '@/src/lib/playback/streamDiagnostics';

export const PlaybackErrorType = {
  STREAM_URL_EXPIRED: 'STREAM_URL_EXPIRED',
  TRACK_UNAVAILABLE: 'TRACK_UNAVAILABLE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  PLAYER_NOT_READY: 'PLAYER_NOT_READY',
  PLAYER_DESTROYED: 'PLAYER_DESTROYED',
  INVALID_STREAM_URL: 'INVALID_STREAM_URL',
  AUDIO_DECODING_ERROR: 'AUDIO_DECODING_ERROR',
  REQUEST_ABORTED: 'REQUEST_ABORTED',
  AUTOPLAY_BLOCKED: 'AUTOPLAY_BLOCKED',
  AUTH_ERROR: 'AUTH_ERROR',
  RATE_LIMIT: 'RATE_LIMIT',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

export type PlaybackErrorTypeValue =
  (typeof PlaybackErrorType)[keyof typeof PlaybackErrorType];

export class PlaybackPipelineError extends Error {
  type: PlaybackErrorTypeValue;
  status: number;
  provider: string | null;
  causeValue: unknown;

  constructor(
    type: PlaybackErrorTypeValue,
    message: string,
    options: { status?: number; provider?: string | null; cause?: unknown } = {}
  ) {
    super(safeErrorMessage(message));
    this.name = 'PlaybackPipelineError';
    this.type = type;
    this.status = Number(options.status || 0);
    this.provider = options.provider || null;
    this.causeValue = options.cause;
  }
}

export function classifyHttpError(status: number, data?: any): PlaybackErrorTypeValue {
  if (status === 401) return PlaybackErrorType.AUTH_ERROR;
  if (status === 403 || status === 410) return PlaybackErrorType.STREAM_URL_EXPIRED;
  if (status === 404) return PlaybackErrorType.TRACK_UNAVAILABLE;
  if (status === 429) return PlaybackErrorType.RATE_LIMIT;
  if (status >= 500) return PlaybackErrorType.NETWORK_ERROR;
  if (data?.code === 'STREAM_FAILED') return PlaybackErrorType.PROVIDER_ERROR;
  return PlaybackErrorType.UNKNOWN;
}

export function classifyPlaybackError(error: unknown): PlaybackPipelineError {
  if (error instanceof PlaybackPipelineError) return error;

  const value = error as any;
  const name = String(value?.name || '');
  const message = String(value?.message || value || '');
  const lower = message.toLowerCase();
  const status = Number(value?.status || value?.statusCode || 0);

  if (name === 'AbortError' || lower.includes('aborted') || lower.includes('cancelled')) {
    return new PlaybackPipelineError(
      PlaybackErrorType.REQUEST_ABORTED,
      'Playback request was cancelled.',
      { status, cause: error }
    );
  }

  if (status) {
    return new PlaybackPipelineError(
      classifyHttpError(status, value?.data),
      message || `HTTP ${status}`,
      { status, cause: error }
    );
  }

  if (
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('dns') ||
    lower.includes('connection') ||
    lower.includes('offline')
  ) {
    return new PlaybackPipelineError(
      PlaybackErrorType.NETWORK_ERROR,
      message || 'Network connection failed.',
      { cause: error }
    );
  }

  if (
    lower.includes('403') ||
    lower.includes('410') ||
    lower.includes('expired') ||
    lower.includes('forbidden')
  ) {
    return new PlaybackPipelineError(
      PlaybackErrorType.STREAM_URL_EXPIRED,
      message || 'Temporary stream URL expired.',
      { cause: error }
    );
  }

  if (
    lower.includes('decode') ||
    lower.includes('decoder') ||
    lower.includes('codec') ||
    lower.includes('format') ||
    lower.includes('parsing_container')
  ) {
    return new PlaybackPipelineError(
      PlaybackErrorType.AUDIO_DECODING_ERROR,
      message || 'Audio decoding failed.',
      { cause: error }
    );
  }

  if (lower.includes('not ready')) {
    return new PlaybackPipelineError(PlaybackErrorType.PLAYER_NOT_READY, message, { cause: error });
  }
  if (lower.includes('destroyed') || lower.includes('released')) {
    return new PlaybackPipelineError(PlaybackErrorType.PLAYER_DESTROYED, message, { cause: error });
  }
  if (lower.includes('unsupported') || lower.includes('invalid url') || lower.includes('invalid stream')) {
    return new PlaybackPipelineError(PlaybackErrorType.INVALID_STREAM_URL, message, { cause: error });
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return new PlaybackPipelineError(PlaybackErrorType.RATE_LIMIT, message, { cause: error });
  }
  if (lower.includes('401') || lower.includes('login_required') || lower.includes('authentication')) {
    return new PlaybackPipelineError(PlaybackErrorType.AUTH_ERROR, message, { cause: error });
  }

  return new PlaybackPipelineError(
    PlaybackErrorType.UNKNOWN,
    message || 'Unknown playback failure.',
    { cause: error }
  );
}
