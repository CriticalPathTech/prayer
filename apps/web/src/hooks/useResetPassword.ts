import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { authErrorCopy } from '../lib/authErrorCopy';
import { supabase } from '../lib/supabase';

export type ResetPasswordState = 'waiting' | 'ready' | 'submitting' | 'timeout';

export interface UseResetPasswordResult {
  state: ResetPasswordState;
  next: string;
  confirm: string;
  setNext: (s: string) => void;
  setConfirm: (s: string) => void;
  error: string | null;
  submit: () => Promise<void>;
}

export function useResetPassword(): UseResetPasswordResult {
  const navigate = useNavigate();
  const [state, setState] = useState<ResetPasswordState>('waiting');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setState((s) => (s === 'waiting' ? 'timeout' : s));
    }, 5000);

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        clearTimeout(timeout);
        setState('ready');
      }
    });

    return () => {
      clearTimeout(timeout);
      data.subscription.unsubscribe();
    };
  }, []);

  async function submit(): Promise<void> {
    setError(null);
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    setState('submitting');
    try {
      const { error: err } = await supabase.auth.updateUser({ password: next });
      if (err) {
        setError(authErrorCopy(err).text);
        setState('ready');
        return;
      }
      navigate('/', { replace: true });
    } catch (caught) {
      setError(authErrorCopy(caught).text);
      setState('ready');
    }
  }

  return { state, next, confirm, setNext, setConfirm, error, submit };
}
