import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { api, isApiError, setSessionExpiredHandler } from '../api/client';
import { keys } from '../api/keys';
import { flushQueue } from '../offline/queue';
import { clearOfflineData } from '../offline/register';
import type { User } from '../types';
import { useToast } from '../components/ui';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  employeeId?: string | undefined;
  designation?: string | undefined;
  location?: string | undefined;
  departmentId?: string | undefined;
  jobRoleId?: string | undefined;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<{ user: User; requiresApproval: boolean }>;
  logout: () => Promise<void>;
  /** Re-reads the signed-in user (after a profile or password change). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** The current user, or null when nobody is signed in (a 401 is a normal state, not an error). */
async function fetchMe(): Promise<User | null> {
  try {
    return (await api.get<User>('/users/me')).data;
  } catch (error) {
    if (isApiError(error) && error.status === 401) return null;
    throw error;
  }
}

/**
 * Forgets everything cached for the previous session - but never the session query itself. `queryClient.clear()`
 * would destroy the query this provider is subscribed to, leaving the context with a stale user until something
 * else happened to re-render it (which broke the redirect to the forced password change right after sign-in).
 */
function clearCachedData(queryClient: QueryClient): void {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== keys.me[0] });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const meQuery = useQuery({ queryKey: keys.me, queryFn: fetchMe, staleTime: 60_000, retry: false });

  // When a refresh fails the API client tells us the session is gone: drop the user and let the guards redirect.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (queryClient.getQueryData(keys.me)) {
        clearCachedData(queryClient);
        queryClient.setQueryData(keys.me, null);
        toast.info('Your session expired. Please sign in again.');
      }
    });
    return () => setSessionExpiredHandler(null);
  }, [queryClient, toast]);

  const refreshUser = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: keys.me });
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string) => {
      await api.post('/auth/login', { email, password });
      // A different account may have been in this browser before: never show its cached data.
      clearCachedData(queryClient);
      const user = await queryClient.fetchQuery({ queryKey: keys.me, queryFn: fetchMe, staleTime: 0 });
      if (!user) throw new Error('Sign-in succeeded but the session could not be started.');
      return user;
    },
    [queryClient],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const { data } = await api.post<{ user: User; requiresApproval: boolean }>('/auth/register', input);
      if (!data.requiresApproval) await queryClient.invalidateQueries({ queryKey: keys.me });
      return data;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    // Work queued offline belongs to the person signing out: send it while their session is still valid.
    await flushQueue().catch(() => undefined);
    try {
      await api.post('/auth/logout');
    } catch {
      // Signing out must always succeed locally, even if the network call fails.
    }
    // These devices are shared: saved courses, cached responses and anything left in the queue go with the session.
    await clearOfflineData().catch(() => undefined);
    clearCachedData(queryClient);
    queryClient.setQueryData(keys.me, null);
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ user: meQuery.data ?? null, loading: meQuery.isLoading, login, register, logout, refreshUser }),
    [meQuery.data, meQuery.isLoading, login, register, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** The signed-in user; only for use inside routes that are already behind `RequireAuth`. */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser called without a signed-in user');
  return user;
}
