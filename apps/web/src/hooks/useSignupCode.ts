import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { previewInviteCode } from '../lib/api';
import { authErrorCopy } from '../lib/authErrorCopy';

export interface UseSignupCodeResult {
  code: string;
  setCode: (s: string) => void;
  submitting: boolean;
  error: string | null;
  submit: () => Promise<void>;
}

export function useSignupCode(): UseSignupCodeResult {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    const trimmed = code.trim().toLowerCase();
    if (trimmed.length !== 5) {
      setError('Invite codes are 5 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const p = await previewInviteCode(trimmed);
      if (p.status === 'valid') {
        navigate(`/signup/account?code=${encodeURIComponent(trimmed)}`);
        return;
      }
      setError(
        p.status === 'not_found'
          ? "We don't recognize that code. Check with whoever invited you."
          : p.status === 'full'
            ? 'This code is no longer accepting new members.'
            : 'This code is no longer active. Ask your inviter for a new one.',
      );
    } catch (err) {
      setError(authErrorCopy(err).text);
    } finally {
      setSubmitting(false);
    }
  }

  return { code, setCode, submitting, error, submit };
}
