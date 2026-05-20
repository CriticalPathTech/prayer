import type { JSX } from 'react';

import { Button } from '../components/ui/Button';
import { Field, inputClass } from '../components/ui/Field';
import { useAuth } from '../hooks/useAuth';
import { useChangePassword } from '../hooks/useChangePassword';

interface SecurityPageProps {
  /** When true, omit the page title and outer container so the form renders
   * cleanly inside a tab parent (e.g. `MemberProfilePage`). Default false. */
  embedded?: boolean;
}

export function SecurityPage({ embedded = false }: SecurityPageProps = {}): JSX.Element {
  const { me } = useAuth();
  const f = useChangePassword();

  if (!me) {
    return <p className="mx-auto max-w-feed p-6 text-sm text-[var(--fg-3)]">Loading…</p>;
  }

  return (
    <div className={embedded ? '' : 'mx-auto max-w-feed'}>
      {embedded ? null : (
        <h1 className="mb-6 font-serif text-[28px] font-semibold tracking-[-0.02em] text-[var(--fg-1)]">
          Security
        </h1>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void f.submit();
        }}
        className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4 shadow-warm-sm"
      >
        <h2 className="mb-2 font-serif text-lg font-medium">Change password</h2>
        <p className="mb-4 text-xs text-[var(--fg-3)]">
          Changing your password won&rsquo;t sign out sessions on your other devices.
        </p>
        <Field label="Current password" id="sec-current">
          <input
            id="sec-current"
            type="password"
            aria-label="Current password"
            value={f.current}
            onChange={(e) => f.setCurrent(e.target.value)}
            autoComplete="current-password"
            className={inputClass}
            required
          />
        </Field>
        <Field label="New password" id="sec-new">
          <input
            id="sec-new"
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
          id="sec-confirm"
          {...(f.error ? { error: f.error } : {})}
        >
          <input
            id="sec-confirm"
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
        <Button type="submit" size="md" disabled={f.submitting}>
          {f.submitting ? 'Updating…' : 'Update password'}
        </Button>
        {f.ok ? (
          <span className="ml-3 text-sm text-sage-700" role="status">
            Password updated.
          </span>
        ) : null}
      </form>
    </div>
  );
}
