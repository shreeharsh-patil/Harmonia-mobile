import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { ACCESS_TOKEN_KEY, CACHED_USER_KEY } from '@/src/config';
import type { HarmoniaUser } from '@/src/types';

export async function readAccessToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function writeAccessToken(token: string) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export async function clearAccessToken() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}

function cacheSafeUser(user: HarmoniaUser): HarmoniaUser {
  const image =
    typeof user.image === 'string' && user.image.startsWith('data:')
      ? null
      : user.image || null;

  return {
    id: String(user.id || ''),
    email: String(user.email || ''),
    name: String(user.name || user.email?.split('@')[0] || 'Harmonia user'),
    image,
    role: user.role,
  };
}

export async function readCachedUser(): Promise<HarmoniaUser | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HarmoniaUser>;
    if (!parsed?.id || !parsed?.email) return null;
    return cacheSafeUser(parsed as HarmoniaUser);
  } catch {
    return null;
  }
}

export async function writeCachedUser(user: HarmoniaUser) {
  await AsyncStorage.setItem(CACHED_USER_KEY, JSON.stringify(cacheSafeUser(user)));
}

export async function clearCachedUser() {
  await AsyncStorage.removeItem(CACHED_USER_KEY);
}
