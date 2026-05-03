import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';

export interface Me {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'member' | 'moderator' | 'super_user';
}

interface AuthState {
  session: Session | null;
  me: Me | null;
  loading: boolean;
  needsOnboarding: boolean;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface MeDto {
  id: string;
  email: string;
  display_name?: string;
  displayName?: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  role: 'member' | 'moderator' | 'super_user';
}

function toMe(dto: MeDto): Me {
  return {
    id: dto.id,
    email: dto.email,
    displayName: dto.displayName ?? dto.display_name ?? '',
    avatarUrl: dto.avatarUrl ?? dto.avatar_url ?? null,
    role: dto.role,
  };
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!activeRef.current) return;
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      activeRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshMe = useCallback(async (): Promise<void> => {
    try {
      const dto = await apiFetch<MeDto>('/me');
      if (!activeRef.current) return;
      setMe(toMe(dto));
      setNeedsOnboarding(false);
    } catch (err: unknown) {
      if (!activeRef.current) return;
      setMe(null);
      const code = (err as { code?: string } | null)?.code;
      setNeedsOnboarding(code === 'ONBOARDING_REQUIRED');
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setMe(null);
      setNeedsOnboarding(false);
      return;
    }
    void refreshMe();
  }, [session, refreshMe]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      me,
      loading,
      needsOnboarding,
      refreshMe,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, me, loading, needsOnboarding, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
