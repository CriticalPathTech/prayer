import { useState } from 'react';

import { supabase } from '../lib/supabase';

import { useAuth } from './useAuth';

export interface UseLoginResult {
  email: string;
  password: string;
  setEmail: (s: string) => void;
  setPassword: (s: string) => void;
  submitting: boolean;
  errorMessage: string | null;
  submit: () => Promise<void>;
}

export function useLogin(): UseLoginResult {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      if (session) {
        await supabase.auth.signOut();
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErrorMessage("That didn't match. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return { email, password, setEmail, setPassword, submitting, errorMessage, submit };
}
