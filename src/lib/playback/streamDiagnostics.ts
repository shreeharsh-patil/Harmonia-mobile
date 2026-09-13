import { HARMONIA_API_URL } from '@/src/config';

export type StreamCacheStatus = 'hit' | 'miss';

export function maskStreamUrl(url?: string | null) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url, HARMONIA_API_URL);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}

export function streamHostname(url?: string | null) {
  if (!url) return 'unknown';
  try {
    return new URL(url, HARMONIA_API_URL).hostname || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function safeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || '');
  return raw
    .replace(/https?:\/\/[^\s]+/gi, (value) => maskStreamUrl(value))
    .replace(/(?:token|sig|signature|expires?|key)=[^&\s]+/gi, (value) => `${value.split('=')[0]}=[redacted]`);
}
