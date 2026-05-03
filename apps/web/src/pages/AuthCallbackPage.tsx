import type { JSX } from 'react';

import { AuthShell } from '../components/AuthShell';
import { useAuthCallback } from '../hooks/useAuthCallback';

export function AuthCallbackPage(): JSX.Element {
  const { state, message } = useAuthCallback();

  return (
    <AuthShell>
      {state === 'waiting' || state === 'redeeming' ? (
        <p className="text-sm text-[var(--fg-3)]">Finishing up…</p>
      ) : null}
      {state === 'timeout' ? (
        <>
          <h1 className="mb-2 font-serif text-[22px] font-semibold text-[var(--fg-1)]">
            Signed in?
          </h1>
          <p className="text-sm text-[var(--fg-3)]">
            Couldn&rsquo;t finish signing you in. Open the email link in the same browser where you
            signed up.
          </p>
        </>
      ) : null}
      {state === 'error' ? <p className="text-sm text-[var(--fg-3)]">{message}</p> : null}
    </AuthShell>
  );
}
