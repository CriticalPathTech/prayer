import type { JSX } from 'react';

import { Button } from '../../components/ui/Button';
import { Field, inputClass } from '../../components/ui/Field';
import { useResetPassword } from '../../hooks/useResetPassword';

import { MobileAuthHeader } from './MobileAuthHeader';

export function MobileResetPasswordPage(): JSX.Element {
  const f = useResetPassword();

  if (f.state === 'waiting') {
    return (
      <div className="flex min-h-screen flex-col items-center bg-[var(--bg-page)] px-4 pb-6 font-sans text-[var(--fg-2)]">
        <MobileAuthHeader />
        <div className="w-full max-w-sm">
          <p className="text-sm text-[var(--fg-3)]">Finishing up…</p>
        </div>
      </div>
    );
  }

  if (f.state === 'timeout') {
    return (
      <div className="flex min-h-screen flex-col items-center bg-[var(--bg-page)] px-4 pb-6 font-sans text-[var(--fg-2)]">
        <MobileAuthHeader />
        <div className="w-full max-w-sm">
          <h1 className="mb-2 font-serif text-[22px] font-semibold text-[var(--fg-1)]">
            Reset link didn&rsquo;t connect
          </h1>
          <p className="text-sm text-[var(--fg-3)]">
            Couldn&rsquo;t pick up your reset session. Open the email link in the same browser where
            you requested the reset.
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
          Set a new password
        </h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void f.submit();
          }}
          className="flex flex-col"
        >
          <Field label="New password" id="mreset-new">
            <input
              id="mreset-new"
              type="password"
              aria-label="New password"
              value={f.next}
              onChange={(e) => f.setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              className={inputClass}
              required
            />
          </Field>
          <Field
            label="Confirm new password"
            id="mreset-confirm"
            {...(f.error ? { error: f.error } : {})}
          >
            <input
              id="mreset-confirm"
              type="password"
              aria-label="Confirm new password"
              value={f.confirm}
              onChange={(e) => f.setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              className={inputClass}
              required
            />
          </Field>
          <Button type="submit" size="lg" disabled={f.state === 'submitting'}>
            {f.state === 'submitting' ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
