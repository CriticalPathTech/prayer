import type { JSX } from 'react';

import { useAuthCallback } from '../../hooks/useAuthCallback';

import { MobileAuthHeader } from './MobileAuthHeader';

export function MobileAuthCallbackPage(): JSX.Element {
  const { state, message } = useAuthCallback();

  return (
    <div className="flex min-h-screen flex-col items-center bg-[var(--bg-page)] px-4 pb-6 font-sans text-[var(--fg-2)]">
      <MobileAuthHeader />
      <div className="w-full max-w-sm">
        {state === 'waiting' || state === 'redeeming' ? (
          <p className="text-sm text-[var(--fg-3)]">Finishing up…</p>
        ) : null}
        {state === 'timeout' ? (
          <>
            <h1 className="mb-2 font-serif text-[22px] font-semibold text-[var(--fg-1)]">
              Signed in?
            </h1>
            <p className="text-sm text-[var(--fg-3)]">
              Couldn&rsquo;t finish signing you in. Open the email link in the same browser where
              you signed up.
            </p>
          </>
        ) : null}
        {state === 'error' ? <p className="text-sm text-[var(--fg-3)]">{message}</p> : null}
      </div>
    </div>
  );
}
