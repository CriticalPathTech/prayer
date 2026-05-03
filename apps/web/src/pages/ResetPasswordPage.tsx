import type { JSX } from 'react';

import { AuthShell } from '../components/AuthShell';
import { Button } from '../components/ui/Button';
import { Field, inputClass } from '../components/ui/Field';
import { useResetPassword } from '../hooks/useResetPassword';

export function ResetPasswordPage(): JSX.Element {
  const f = useResetPassword();

  if (f.state === 'waiting') {
    return (
      <AuthShell>
        <p className="text-sm text-[var(--fg-3)]">Finishing up…</p>
      </AuthShell>
    );
  }

  if (f.state === 'timeout') {
    return (
      <AuthShell>
        <h1 className="mb-2 font-serif text-[22px] font-semibold text-[var(--fg-1)]">
          Reset link didn&rsquo;t connect
        </h1>
        <p className="text-sm text-[var(--fg-3)]">
          Couldn&rsquo;t pick up your reset session. Open the email link in the same browser where
          you requested the reset.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
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
        <Field label="New password" id="reset-new">
          <input
            id="reset-new"
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
          id="reset-confirm"
          {...(f.error ? { error: f.error } : {})}
        >
          <input
            id="reset-confirm"
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
    </AuthShell>
  );
}
