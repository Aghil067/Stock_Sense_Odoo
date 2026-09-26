import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './lib/api';
import type { User } from './types';
import { useQueryClient } from '@tanstack/react-query';

type AuthContextValue = {
  user: User | null; isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    try { setUser(await api<User>('/auth/me')); } catch { setUser(null); }
  }

  useEffect(() => { refresh().finally(() => setIsLoading(false)); }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user, isLoading,
    login: async (email, password) => { const nextUser = await api<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); queryClient.clear(); setUser(nextUser); },
    logout: async () => { await api('/auth/logout', { method: 'POST' }); queryClient.clear(); setUser(null); },
    refresh,
  }), [user, isLoading, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

