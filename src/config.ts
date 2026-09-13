function publicUrl(value: string | undefined) {
  return String(value || '').trim().replace(/\/$/, '');
}

export const HARMONIA_API_URL = publicUrl(
  process.env.EXPO_PUBLIC_HARMONIA_API_URL
);

export const HARMONIA_STREAM_API_URL = publicUrl(
  process.env.EXPO_PUBLIC_HARMONIA_STREAM_API_URL ||
  process.env.EXPO_PUBLIC_HARMONIA_BACKEND_URL
);

export const HAS_HARMONIA_API = Boolean(HARMONIA_API_URL);
export const HAS_HARMONIA_STREAM_API = Boolean(HARMONIA_STREAM_API_URL);

export const APP_NAME = 'Harmonia';
export const APP_VERSION = '0.3.0';
export const ANDROID_BUILD_VERSION = '2';
export const PLAYBACK_SNAPSHOT_KEY = 'harmonia.mobile.playback.v1';
export const ACCESS_TOKEN_KEY = 'harmonia.mobile.access-token.v1';
export const CACHED_USER_KEY = 'harmonia.mobile.cached-user.v1';

export const RECENT_SEARCHES_KEY = 'harmonia.mobile.recent-searches.v1';
