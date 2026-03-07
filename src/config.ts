export const HARMONIA_API_URL = (
  process.env.EXPO_PUBLIC_HARMONIA_API_URL || 'https://jammify-music.vercel.app'
).replace(/\/$/, '');

export const APP_NAME = 'Harmonia';
export const PLAYBACK_SNAPSHOT_KEY = 'harmonia.mobile.playback.v1';
export const ACCESS_TOKEN_KEY = 'harmonia.mobile.access-token.v1';
