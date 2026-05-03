import type { JSX } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { CheckEmailPanel } from '../../components/CheckEmailPanel';
import { Button } from '../../components/ui/Button';
import { Field, inputClass } from '../../components/ui/Field';
import { useForgotPassword } from '../../hooks/useForgotPassword';
import { supabase } from '../../lib/supabase';

import { MobileAuthHeader } from './MobileAuthHeader';

export function MobileForgotPasswordPage(): JSX.Element {
  const [params] = useSearchParams();
  const f = useForgotPassword(params.get('email') ?? '');

  if (f.sent) {
    return (
      <div className="flex min-h-screen flex-col items-center bg-[var(--bg-page)] px-4 pb-6 font-sans text-[var(--fg-2)]">
        <MobileAuthHeader />
        <div className="w-full max-w-sm">
          <h1 className="mb-2 font-serif text-[22px] font-semibold text-[var(--fg-1)]">
            Check your email
          </h1>
          <CheckEmailPanel
            email={f.email}
            resendFn={() =>
              supabase.auth.resetPasswordForEmail(f.email, {
                redirectTo: `${window.location.origin}/auth/reset-password`,
              })
            }
          />
          <p className="mb-6 mt-2 text-xs text-[var(--fg-4)]">
            Tip: open the reset link in the same browser you used here.
          </p>
          <p className="mt-3 text-xs">
            <Link to="/login" className="text-[var(--fg-3)] hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-[var(--bg-page)] px-4 pb-6 font-sans text-[var(--fg-2)]">
      <MobileAuthHeader />
      <div className="w-full max-w-sm">
        <h1 className="mb-2 font-serif text-[22px] font-semibold text-[var(--fg-1)]">
          Reset your password
        </h1>
        <p className="mb-4 text-sm text-[var(--fg-3)]">
          Enter your email and we&rsquo;ll send you a reset link.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void f.submit();
          }}
          className="flex flex-col"
        >
          <Field label="Email" id="mforgot-email" {...(f.error ? { error: f.error } : {})}>
            <input
              id="mforgot-email"
              aria-label="Email"
              type="email"
              value={f.email}
              onChange={(e) => f.setEmail(e.target.value)}
              autoComplete="email"
              className={inputClass}
              required
            />
          </Field>
          <Button type="submit" size="lg" disabled={f.submitting}>
            {f.submitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
        <p className="mt-5 text-xs text-[var(--fg-3)]">
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-vesper-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
