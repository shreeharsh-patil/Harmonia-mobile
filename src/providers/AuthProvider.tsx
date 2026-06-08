import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { HARMONIA_API_URL } from '@/src/config';
import {
  exchangeMobileTicket,
  fetchMe,
  loginWithPassword,
} from '@/src/lib/api';
import {
  clearAccessToken,
  readAccessToken,
  writeAccessToken,
} from '@/src/lib/session';
import type { HarmoniaUser } from '@/src/types';

type AuthContextValue = {
  token: string | null;
  user: HarmoniaUser | null;
  loading: boolean;
  authenticating: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  signInWithProvider: (provider: 'google' | 'github') => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<HarmoniaUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adoptSession = useCallback(async (accessToken: string, nextUser: HarmoniaUser) => {
    await writeAccessToken(accessToken);
    setToken(accessToken);
    setUser(nextUser);
    setError(null);
  }, []);

  const processDeepLink = useCallback(async (url?: string | null) => {
    if (!url || !url.includes('oauthredirect')) return;
    const parsed = Linking.parse(url);
    const ticket = typeof parsed.queryParams?.ticket === 'string' ? parsed.queryParams.ticket : null;
    const oauthError = typeof parsed.queryParams?.error === 'string' ? parsed.queryParams.error : null;

    if (oauthError) {
      setError('Social sign-in could not be completed.');
      setAuthenticating(false);
      return;
    }
    if (!ticket) return;

    setAuthenticating(true);
    try {
      const result = await exchangeMobileTicket(ticket);
      await adoptSession(result.accessToken, result.user);
    } catch (cause: any) {
      setError(cause?.message || 'Unable to finish sign-in');
    } finally {
      setAuthenticating(false);
      WebBrowser.dismissBrowser().catch(() => {});
    }
  }, [adoptSession]);

  useEffect(() => {
    let active = true;
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void processDeepLink(url);
    });

    (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl?.includes('oauthredirect')) {
          await processDeepLink(initialUrl);
        }

        const saved = await readAccessToken();
        if (!saved || !active) return;
        const result = await fetchMe(saved);
        if (!active) return;
        setToken(saved);
        setUser(result.user);
      } catch {
        await clearAccessToken().catch(() => {});
        if (active) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      subscription.remove();
    };
  }, [processDeepLink]);

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthenticating(true);
    setError(null);
    try {
      const result = await loginWithPassword(email, password);
      await adoptSession(result.accessToken, result.user);
      return true;
    } catch (cause: any) {
      setError(cause?.message || 'Unable to sign in');
      return false;
    } finally {
      setAuthenticating(false);
    }
  }, [adoptSession]);

  const signInWithProvider = useCallback(async (provider: 'google' | 'github') => {
    setAuthenticating(true);
    setError(null);
    try {
      await WebBrowser.openBrowserAsync(
        `${HARMONIA_API_URL}/auth/mobile-google-start?provider=${encodeURIComponent(provider)}`
      );
    } catch (cause: any) {
      setError(cause?.message || 'Unable to open sign-in');
      setAuthenticating(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await clearAccessToken().catch(() => {});
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const result = await fetchMe(token);
    setUser(result.user);
  }, [token]);

  const value = useMemo<AuthContextValue>(() => ({
    token,
    user,
    loading,
    authenticating,
    error,
    signIn,
    signInWithProvider,
    signOut,
    refreshUser,
  }), [token, user, loading, authenticating, error, signIn, signInWithProvider, signOut, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
