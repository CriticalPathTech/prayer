import { useState } from 'react';

import { authErrorCopy } from '../lib/authErrorCopy';
import { supabase } from '../lib/supabase';

export interface UseForgotPasswordResult {
  email: string;
  setEmail: (s: string) => void;
  submitting: boolean;
  sent: boolean;
  error: string | null;
  submit: () => Promise<void>;
}

export function useForgotPassword(initialEmail = ''): UseForgotPasswordResult {
  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (err) {
        setError(authErrorCopy(err).text);
        return;
      }
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return { email, setEmail, submitting, sent, error, submit };
}
