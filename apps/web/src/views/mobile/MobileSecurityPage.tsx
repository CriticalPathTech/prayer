import type { JSX } from 'react';

import { Button } from '../../components/ui/Button';
import { Field, inputClass } from '../../components/ui/Field';
import { useAuth } from '../../hooks/useAuth';
import { useChangePassword } from '../../hooks/useChangePassword';

import { MobilePageHeader } from './MobilePageHeader';

interface MobileSecurityPageProps {
  /** When true, omit the `MobilePageHeader` and outer container padding so the
   * form renders cleanly inside a tab parent (e.g. `MobileMemberProfilePage`).
   * Default false. */
  embedded?: boolean;
}

export function MobileSecurityPage({
  embedded = false,
}: MobileSecurityPageProps = {}): JSX.Element {
  const { me } = useAuth();
  const f = useChangePassword();

  if (!me) {
    return (
      <>
        {embedded ? null : <MobilePageHeader variant={{ kind: 'back', title: 'Security' }} />}
        <div className="px-4 py-16 text-center text-sm text-[var(--fg-3)]">Loading…</div>
      </>
    );
  }

  return (
    <>
      {embedded ? null : <MobilePageHeader variant={{ kind: 'back', title: 'Security' }} />}
      <div
        className={embedded ? 'flex flex-col gap-4' : 'flex flex-1 flex-col gap-4 px-4 pb-6 pt-3'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void f.submit();
          }}
          className="flex flex-col gap-4 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4 shadow-warm-sm"
        >
          <div>
            <h2 className="font-serif text-lg font-medium">Change password</h2>
            <p className="mt-1 text-xs text-[var(--fg-3)]">
              Changing your password won&rsquo;t sign out sessions on your other devices.
            </p>
          </div>
          <Field label="Current password" id="msec-current">
            <input
              id="msec-current"
              type="password"
              aria-label="Current password"
              value={f.current}
              onChange={(e) => f.setCurrent(e.target.value)}
              autoComplete="current-password"
              className={inputClass}
              required
            />
          </Field>
          <Field label="New password" id="msec-new">
            <input
              id="msec-new"
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
            id="msec-confirm"
            {...(f.error ? { error: f.error } : {})}
          >
            <input
              id="msec-confirm"
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
          <Button type="button" size="md" disabled={f.submitting} onClick={() => void f.submit()}>
            {f.submitting ? 'Updating…' : 'Update password'}
          </Button>
          {f.ok ? (
            <span className="text-sm text-sage-700" role="status">
              Password updated.
            </span>
          ) : null}
        </form>
      </div>
    </>
  );
}
