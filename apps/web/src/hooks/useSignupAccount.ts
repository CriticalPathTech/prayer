import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { previewInviteCode, redeemInviteCode, type InviteCodePreview } from '../lib/api';
import { authErrorCopy } from '../lib/authErrorCopy';
import { supabase } from '../lib/supabase';

export type PreviewState =
  | { kind: 'loading' }
  | { kind: 'ok'; preview: InviteCodePreview }
  | { kind: 'error'; message: string };

export interface UseSignupAccountResult {
  preview: PreviewState;
  email: string;
  password: string;
  confirm: string;
  setEmail: (s: string) => void;
  setPassword: (s: string) => void;
  setConfirm: (s: string) => void;
  passwordError: string | null;
  formError: string | null;
  submitting: boolean;
  alreadyRegistered: boolean;
  submit: () => Promise<void>;
  joining: boolean;
  joinError: string | null;
  joinExisting: () => Promise<void>;
}

function previewErrorMessage(status: Exclude<InviteCodePreview['status'], 'valid'>): string {
  if (status === 'not_found') {
    return "We don't recognize that code. Check with whoever invited you.";
  }
  if (status === 'full') {
    return 'This code is no longer accepting new members.';
  }
  return 'This code is no longer active. Ask your inviter for a new one.';
}

export function useSignupAccount(code: string): UseSignupAccountResult {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<PreviewState>({ kind: 'loading' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      navigate('/signup', { replace: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const p = await previewInviteCode(code);
        if (cancelled) return;
        if (p.status === 'valid') {
          setPreview({ kind: 'ok', preview: p });
        } else {
          setPreview({ kind: 'error', message: previewErrorMessage(p.status) });
        }
      } catch (err) {
        if (cancelled) return;
        setPreview({ kind: 'error', message: authErrorCopy(err).text });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, navigate]);

  async function submit(): Promise<void> {
    setPasswordError(null);
    setFormError(null);

    if (password !== confirm) {
      setPasswordError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const guard = await previewInviteCode(code);
      if (guard.status !== 'valid') {
        navigate('/signup', { replace: true });
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { invite_code: code },
        },
      });
      if (error) {
        setFormError(authErrorCopy(error).text);
        return;
      }
      // Defense-in-depth: supabase-js 2.106.0 regressed and returned
      // data.user: null for successful sign-ups; without this guard the
      // hook would silently navigate to /signup/check-email and the user
      // would wait for an email that never comes.
      if (data?.user == null) {
        setFormError(authErrorCopy(null).text);
        return;
      }
      const identities = (data.user as { identities?: unknown[] }).identities;
      if (Array.isArray(identities) && identities.length === 0) {
        setAlreadyRegistered(true);
        return;
      }
      navigate(
        `/signup/check-email?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`,
      );
    } catch (err) {
      setFormError(authErrorCopy(err).text);
    } finally {
      setSubmitting(false);
    }
  }

  // The account already exists in the shared auth project — which happens to
  // anyone who was removed from a church, or who belongs to another church on
  // the same Supabase project. `signUp` short-circuits for them, so the normal
  // path (write invite_code into user_metadata → redeem at /auth/callback)
  // never runs and the code is never redeemed. Sign them in with the password
  // they just typed and redeem directly against their existing session.
  // POST /invitations/redeem sits behind requireSession, not requireMember, so
  // a non-member is allowed to call it.
  async function joinExisting(): Promise<void> {
    setJoinError(null);
    setJoining(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setJoinError(authErrorCopy(error).text);
        return;
      }
      await redeemInviteCode(code);
      navigate('/', { replace: true });
    } catch (err) {
      setJoinError(authErrorCopy(err).text);
    } finally {
      setJoining(false);
    }
  }

  return {
    preview,
    email,
    password,
    confirm,
    setEmail,
    setPassword,
    setConfirm,
    passwordError,
    formError,
    submitting,
    alreadyRegistered,
    submit,
    joining,
    joinError,
    joinExisting,
  };
}
