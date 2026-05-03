import { useState } from 'react';

import { authErrorCopy } from '../lib/authErrorCopy';
import { supabase } from '../lib/supabase';

import { useAuth } from './useAuth';

export interface UseChangePasswordResult {
  current: string;
  next: string;
  confirm: string;
  setCurrent: (s: string) => void;
  setNext: (s: string) => void;
  setConfirm: (s: string) => void;
  submitting: boolean;
  error: string | null;
  ok: boolean;
  submit: () => Promise<void>;
}

export function useChangePassword(): UseChangePasswordResult {
  const { me } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setOk(false);
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    if (!me) return;
    setSubmitting(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: me.email,
        password: current,
      });
      if (signInErr) {
        setError(authErrorCopy(signInErr).text);
        return;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password: next });
      if (updateErr) {
        setError(authErrorCopy(updateErr).text);
        return;
      }
      setOk(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } finally {
      setSubmitting(false);
    }
  }

  return {
    current,
    next,
    confirm,
    setCurrent,
    setNext,
    setConfirm,
    submitting,
    error,
    ok,
    submit,
  };
}
