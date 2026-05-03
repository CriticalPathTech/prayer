import type { JSX } from 'react';
import { useEffect, useState } from 'react';

import { authErrorCopy } from '../lib/authErrorCopy';

import { Button } from './ui/Button';

export interface ResendResult {
  error: { code?: string | undefined; message?: string | undefined } | null;
}

export interface CheckEmailPanelProps {
  email: string;
  resendFn: () => Promise<ResendResult>;
}

export function CheckEmailPanel({ email, resendFn }: CheckEmailPanelProps): JSX.Element {
  const [disabledUntil, setDisabledUntil] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const disabled = now < disabledUntil;
  const secondsLeft = Math.max(0, Math.ceil((disabledUntil - now) / 1000));

  async function onResend(): Promise<void> {
    setMessage(null);
    const { error } = await resendFn();
    if (error) {
      setMessage(authErrorCopy(error).text);
      if (error.code === 'over_email_send_rate_limit') {
        setDisabledUntil(Date.now() + 5 * 60_000);
      } else {
        setDisabledUntil(Date.now() + 60_000);
      }
    } else {
      setMessage('Email sent.');
      setDisabledUntil(Date.now() + 60_000);
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-[var(--fg-3)]">
        We sent an email to <strong className="text-[var(--fg-2)]">{email}</strong>.
      </p>
      <Button type="button" size="lg" onClick={() => void onResend()} disabled={disabled}>
        {disabled ? `Resend (${secondsLeft}s)` : 'Resend email'}
      </Button>
      {message ? <p className="mt-3 text-sm text-[var(--fg-3)]">{message}</p> : null}
    </div>
  );
}
