import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { redeemInviteCode } from '../lib/api';
import { authErrorCopy } from '../lib/authErrorCopy';
import { supabase } from '../lib/supabase';

export type AuthCallbackState = 'waiting' | 'redeeming' | 'error' | 'timeout';

export interface UseAuthCallbackResult {
  state: AuthCallbackState;
  message: string | null;
}

export function useAuthCallback(): UseAuthCallbackResult {
  const navigate = useNavigate();
  const [state, setState] = useState<AuthCallbackState>('waiting');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setState((s) => (s === 'waiting' ? 'timeout' : s));
    }, 5000);
    let alreadyRedeemedTimer: ReturnType<typeof setTimeout> | null = null;

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user) return;
      clearTimeout(timeout);
      setState('redeeming');
      const code = (session.user.user_metadata as { invite_code?: unknown } | null)?.invite_code;
      if (typeof code !== 'string' || code.length === 0) {
        setState('error');
        setMessage('Signup link is invalid — contact your inviter.');
        return;
      }
      try {
        await redeemInviteCode(code);
        navigate('/', { replace: true });
      } catch (err) {
        setState('error');
        setMessage(authErrorCopy(err).text);
        if ((err as { code?: string } | null)?.code === 'ALREADY_REDEEMED') {
          alreadyRedeemedTimer = setTimeout(() => navigate('/', { replace: true }), 1000);
        }
      }
    });

    return () => {
      clearTimeout(timeout);
      if (alreadyRedeemedTimer) clearTimeout(alreadyRedeemedTimer);
      data.subscription.unsubscribe();
    };
  }, [navigate]);

  return { state, message };
}
