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
  const committedTokenRef = useRef(token);
  const sessionGenerationRef = useRef(0);
  const sessionWriteChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const enqueueSessionWrite = useCallback((operation: () => Promise<unknown>) => {
    const pending = sessionWriteChainRef.current
      .catch(() => {})
      .then(operation);
    sessionWriteChainRef.current = pending.catch(() => {});
    return pending;
  }, []);

  const adoptSession = useCallback(async (
    accessToken: string,
    nextUser: HarmoniaUser,
    generation: number
  ) => {
    if (sessionGenerationRef.current !== generation) return false;
    const previousToken = committedTokenRef.current;
    // Mark the pending account immediately so older refreshes cannot update or
    // clear it while secure persistence is still completing.
    tokenRef.current = accessToken;

    try {
      const persisted = await enqueueSessionWrite(async () => {
        if (sessionGenerationRef.current !== generation) return false;

        let tokenWritten = false;
        try {
          await writeAccessToken(accessToken);
          tokenWritten = true;
          try {
            await writeCachedUser(nextUser);
          } catch {
            // Never leave another account's cached profile paired with this token.
            await clearCachedUser();
          }

          if (sessionGenerationRef.current !== generation) {
            if (previousToken) await writeAccessToken(previousToken);
            else await clearAccessToken();
            await clearCachedUser().catch(() => {});
            return false;
          }
          return true;
        } catch (cause) {
          if (tokenWritten) {
            if (previousToken) await writeAccessToken(previousToken).catch(() => {});
            else await clearAccessToken().catch(() => {});
            await clearCachedUser().catch(() => {});
          }
          throw cause;
        }
      });

      if (!persisted || sessionGenerationRef.current !== generation) {
        if (tokenRef.current === accessToken) tokenRef.current = previousToken;
        return false;
      }
    } catch (cause) {
      if (sessionGenerationRef.current === generation) {
        tokenRef.current = previousToken;
      }
      throw cause;
    }

    if (sessionGenerationRef.current !== generation) return false;
    committedTokenRef.current = accessToken;
    setToken(accessToken);
    setUser(nextUser);
    setError(null);
    return true;
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
    const generation = ++sessionGenerationRef.current;
    setAuthenticating(true);
    try {
      const result = await exchangeMobileTicket(ticket);
      const adopted = await adoptSession(result.accessToken, result.user, generation);
      if (adopted) completedTicketsRef.current.add(ticket);
    } catch (cause: any) {
      if (sessionGenerationRef.current === generation) {
        setError(cause?.message || 'Unable to finish sign-in');
      }
    } finally {
      if (activeTicketRef.current === ticket) activeTicketRef.current = null;
      if (sessionGenerationRef.current === generation) setAuthenticating(false);
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
        committedTokenRef.current = saved;
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
            committedTokenRef.current = null;
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
          committedTokenRef.current = null;
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
    const generation = ++sessionGenerationRef.current;
    setAuthenticating(true);
    setError(null);
    try {
      const result = await loginWithPassword(email, password);
      return await adoptSession(result.accessToken, result.user, generation);
    } catch (cause: any) {
      if (sessionGenerationRef.current === generation) {
        setError(cause?.message || 'Unable to sign in');
      }
      return false;
    } finally {
      if (sessionGenerationRef.current === generation) setAuthenticating(false);
    }
  }, [adoptSession]);

  const signInWithProvider = useCallback(async (provider: 'google' | 'github') => {
    const generation = ++sessionGenerationRef.current;
    setAuthenticating(true);
    setError(null);
    try {
      if (!HAS_HARMONIA_API) {
        setError('Sign-in is unavailable in this build. You can still listen without an account.');
        return;
      }
      await WebBrowser.openBrowserAsync(
        `${HARMONIA_API_URL}/auth/mobile-google-start?provider=${encodeURIComponent(provider)}`
      );
    } catch (cause: any) {
      if (sessionGenerationRef.current === generation) {
        setError(cause?.message || 'Unable to open sign-in');
      }
    } finally {
      // A user may simply close the Custom Tab. Never leave auth controls
      // permanently disabled when no deep-link callback arrives.
      if (sessionGenerationRef.current === generation) setAuthenticating(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    const previousToken = committedTokenRef.current;
    const previousUser = user;
    const generation = ++sessionGenerationRef.current;
    tokenRef.current = null;
    committedTokenRef.current = null;
    setToken(null);
    setUser(null);
    setError(null);
    setAuthenticating(false);

    try {
      await enqueueSessionWrite(async () => {
        // Secure token deletion is the boundary for a completed sign-out.
        // Cache cleanup is best-effort because it cannot restore a session.
        await clearAccessToken();
        await clearCachedUser().catch(() => {});
      });
    } catch (cause) {
      if (sessionGenerationRef.current === generation) {
        tokenRef.current = previousToken;
        committedTokenRef.current = previousToken;
        setToken(previousToken);
        setUser(previousUser);
        setError('Unable to securely sign out. Please try again.');
      }
      throw cause;
    }

    // A newer sign-in may have been queued while storage was clearing.
    if (sessionGenerationRef.current !== generation) return;
  }, [enqueueSessionWrite, user]);

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
        committedTokenRef.current = null;
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
