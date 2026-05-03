import type { JSX } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { CheckEmailPanel } from '../../components/CheckEmailPanel';
import { supabase } from '../../lib/supabase';

import { MobileAuthHeader } from './MobileAuthHeader';

export function MobileCheckEmailPage(): JSX.Element {
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const code = params.get('code') ?? '';

  return (
    <div className="flex min-h-screen flex-col items-center bg-[var(--bg-page)] px-4 pb-6 font-sans text-[var(--fg-2)]">
      <MobileAuthHeader />
      <div className="w-full max-w-sm">
        <h1 className="mb-2 font-serif text-[22px] font-semibold text-[var(--fg-1)]">
          Check your email
        </h1>
        <CheckEmailPanel
          email={email}
          resendFn={() => supabase.auth.resend({ type: 'signup', email })}
        />
        <p className="mt-2 text-sm text-[var(--fg-3)]">Click the link to finish signing up.</p>
        <p className="mb-6 text-xs text-[var(--fg-4)]">
          Tip: open it in the same browser you used here.
        </p>
        <p className="mt-3 text-xs">
          <Link
            to={`/signup/account?code=${encodeURIComponent(code)}`}
            className="text-[var(--fg-3)] hover:underline"
          >
            Wrong email? Go back
          </Link>
        </p>
        <p className="mt-5 text-xs text-[var(--fg-3)]">
          If this email is already registered,{' '}
          <Link to="/login" className="font-medium text-vesper-700 hover:underline">
            sign in instead
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
