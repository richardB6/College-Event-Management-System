import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, refreshCsrfToken } from '../lib/api';
import type { AuthUser } from '../lib/types';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (path: string, payload: Record<string, string | number>) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const authQuery = useQuery({
    queryKey: ['auth'],
    queryFn: () => api<{ user: AuthUser | null }>('/auth/me'),
    retry: false,
    staleTime: 30_000,
  });

  const signIn = useCallback(async (path: string, payload: Record<string, string | number>) => {
    const result = await api<{ user: AuthUser }>(path, { method: 'POST', body: JSON.stringify(payload) });
    await refreshCsrfToken();
    queryClient.setQueryData(['auth'], { user: result.user });
  }, [queryClient]);

  const signOut = useCallback(async () => {
    await api<void>('/auth/logout', { method: 'POST' });
    await refreshCsrfToken();
    queryClient.setQueryData(['auth'], { user: null });
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => ({
    user: authQuery.data?.user ?? null,
    isLoading: authQuery.isLoading,
    signIn,
    signOut,
  }), [authQuery.data?.user, authQuery.isLoading, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
