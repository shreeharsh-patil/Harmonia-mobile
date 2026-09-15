import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { HARMONIA_API_URL, HAS_HARMONIA_API } from '@/src/config';
import {
  ApiError,
  exchangeMobileTicket,
  fetchMe,
  loginWithPassword,
} from '@/src/lib/api';
import {
  clearAccessToken,
  clearCachedUser,
  readAccessToken,
  readCachedUser,
  writeAccessToken,
  writeCachedUser,
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
  const activeTicketRef = useRef<string | null>(null);
  const completedTicketsRef = useRef(new Set<string>());
  const tokenRef = useRef(token);
  const sessionGenerationRef = useRef(0);
  const sessionWriteChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const enqueueSessionWrite = useCallback((operation: () => Promise<unknown>) => {
    const pending = sessionWriteChainRef.current
      .catch(() => {})
      .then(operation);
    sessionWriteChainRef.current = pending.catch(() => {});
    return pending;
  }, []);

  const adoptSession = useCallback(async (accessToken: string, nextUser: HarmoniaUser) => {
    const previousToken = tokenRef.current;
    const generation = ++sessionGenerationRef.current;
    // Mark the pending account immediately so older refreshes cannot update or
    // clear it while secure persistence is still completing.
    tokenRef.current = accessToken;

    try {
      await enqueueSessionWrite(async () => {
        await writeAccessToken(accessToken);
        await writeCachedUser(nextUser).catch(() => {});
      });
    } catch (cause) {
      if (sessionGenerationRef.current === generation) {
        tokenRef.current = previousToken;
      }
      throw cause;
    }

    if (sessionGenerationRef.current !== generation) return;
    setToken(accessToken);
    setUser(nextUser);
    setError(null);
  }, [enqueueSessionWrite]);

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
    if (
      completedTicketsRef.current.has(ticket) ||
      activeTicketRef.current === ticket
    ) {
      return;
    }

    activeTicketRef.current = ticket;
    setAuthenticating(true);
    try {
      const result = await exchangeMobileTicket(ticket);
      await adoptSession(result.accessToken, result.user);
      completedTicketsRef.current.add(ticket);
    } catch (cause: any) {
      setError(cause?.message || 'Unable to finish sign-in');
    } finally {
      if (activeTicketRef.current === ticket) activeTicketRef.current = null;
      setAuthenticating(false);
      WebBrowser.dismissBrowser().catch(() => {});
    }
  }, [adoptSession]);

  useEffect(() => {
    let active = true;
    const startupGeneration = sessionGenerationRef.current;
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void processDeepLink(url);
    });

    (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl?.includes('oauthredirect')) {
          await processDeepLink(initialUrl);
        }

        if (!active || sessionGenerationRef.current !== startupGeneration) return;

        const [saved, cachedUser] = await Promise.all([
          readAccessToken(),
          readCachedUser(),
        ]);

        if (
          !saved ||
          !active ||
          sessionGenerationRef.current !== startupGeneration
        ) return;

        // Restore a usable session immediately. A slow or unavailable network
        // must not sign a valid user out of the app.
        tokenRef.current = saved;
        setToken(saved);
        if (cachedUser) {
          setUser(cachedUser);
          // A cached authenticated session is enough to render immediately.
          // Refresh account details in the background instead of blocking cold start.
          setLoading(false);
        }

        try {
          const result = await fetchMe(saved);
          if (
            !active ||
            sessionGenerationRef.current !== startupGeneration ||
            tokenRef.current !== saved
          ) return;
          setUser(result.user);
          await writeCachedUser(result.user).catch(() => {});
          setError(null);
        } catch (cause) {
          const rejected =
            cause instanceof ApiError &&
            (cause.status === 401 || cause.status === 403);

          if (rejected) {
            if (
              sessionGenerationRef.current !== startupGeneration ||
              tokenRef.current !== saved
            ) return;
            const clearGeneration = ++sessionGenerationRef.current;
            tokenRef.current = null;
            await enqueueSessionWrite(() => Promise.all([
              clearAccessToken().catch(() => {}),
              clearCachedUser().catch(() => {}),
            ]));
            if (active && sessionGenerationRef.current === clearGeneration) {
              setToken(null);
              setUser(null);
            }
          } else if (active && !cachedUser) {
            setError('Could not refresh your account. Check your connection and try again.');
          }
        }
      } catch {
        // Secure storage itself failed. Do not pretend a session was restored.
        if (active && sessionGenerationRef.current === startupGeneration) {
          tokenRef.current = null;
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
  }, [enqueueSessionWrite, processDeepLink]);

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
      if (!HAS_HARMONIA_API) {
        setError('Sign-in needs your Harmonia backend. Playback can still work without it.');
        return;
      }
      await WebBrowser.openBrowserAsync(
        `${HARMONIA_API_URL}/auth/mobile-google-start?provider=${encodeURIComponent(provider)}`
      );
    } catch (cause: any) {
      setError(cause?.message || 'Unable to open sign-in');
    } finally {
      // A user may simply close the Custom Tab. Never leave auth controls
      // permanently disabled when no deep-link callback arrives.
      setAuthenticating(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    const generation = ++sessionGenerationRef.current;
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    setError(null);

    await enqueueSessionWrite(() => Promise.all([
      clearAccessToken().catch(() => {}),
      clearCachedUser().catch(() => {}),
    ]));

    // A newer sign-in may have been queued while storage was clearing.
    if (sessionGenerationRef.current !== generation) return;
  }, [enqueueSessionWrite]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const refreshToken = token;
    try {
      const result = await fetchMe(refreshToken);
      if (tokenRef.current !== refreshToken) return;
      setUser(result.user);
      await writeCachedUser(result.user).catch(() => {});
    } catch (cause) {
      // A response from an older account must never clear or overwrite a
      // session that became active while the refresh request was in flight.
      if (tokenRef.current !== refreshToken) return;
      if (
        cause instanceof ApiError &&
        (cause.status === 401 || cause.status === 403) &&
        tokenRef.current === refreshToken
      ) {
        const clearGeneration = ++sessionGenerationRef.current;
        tokenRef.current = null;
        await enqueueSessionWrite(() => Promise.all([
          clearAccessToken().catch(() => {}),
          clearCachedUser().catch(() => {}),
        ]));
        if (sessionGenerationRef.current === clearGeneration) {
          setToken(null);
          setUser(null);
        }
      }
      throw cause;
    }
  }, [enqueueSessionWrite, token]);

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
