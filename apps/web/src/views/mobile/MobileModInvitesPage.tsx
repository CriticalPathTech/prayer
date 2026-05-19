import type { JSX } from 'react';
import { Navigate } from 'react-router-dom';

import { ModTabs } from '../../components/ModTabs';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field, inputClass } from '../../components/ui/Field';
import { Pill } from '../../components/ui/Pill';
import { useAuth } from '../../hooks/useAuth';
import { useModInvites } from '../../hooks/useModInvites';
import { isPrivilegedRole } from '../../lib/roles';

import { MobilePageHeader } from './MobilePageHeader';

export function MobileModInvitesPage(): JSX.Element {
  const { me } = useAuth();
  const m = useModInvites();

  if (!me) {
    return (
      <>
        <MobilePageHeader variant={{ kind: 'back', title: 'Grant invites' }} />
        <div className="px-4 py-16 text-center text-sm text-[var(--fg-3)]">Loading…</div>
      </>
    );
  }
  if (!isPrivilegedRole(me.role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <MobilePageHeader variant={{ kind: 'back', title: 'Moderation' }} />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-3">
        <ModTabs />
        <section className="flex flex-col gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4">
          <h2 className="font-serif text-lg font-medium">Grant a new code</h2>
          <Field label="Member">
            <input
              aria-label="Member"
              value={m.query}
              onChange={(e) => {
                m.setQuery(e.target.value);
                void m.search();
              }}
              className={inputClass}
              placeholder="Search by name or email"
            />
          </Field>
          {m.results.length > 0 ? (
            <ul className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)]">
              {m.results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => void m.selectUser(u)}
                    className="w-full p-3 text-left text-sm hover:bg-[var(--bg-raised)]"
                  >
                    {u.display_name} <span className="text-[var(--fg-4)]">{u.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Field label="Seats">
            <input
              type="number"
              aria-label="Seats"
              min={1}
              max={10}
              value={Number.isNaN(m.seatCap) ? '' : m.seatCap}
              onChange={(e) => m.setSeatCap(e.target.valueAsNumber)}
              className={`${inputClass} w-24`}
            />
          </Field>
          <Button
            type="button"
            onClick={() => void m.grant()}
            disabled={!m.selected || Number.isNaN(m.seatCap) || m.seatCap < 1 || m.seatCap > 10}
          >
            Grant code
          </Button>
          {m.toast ? <p className="text-sm text-sage-700">{m.toast}</p> : null}
          {m.error ? <p className="text-sm text-ember-600">{m.error}</p> : null}
        </section>

        {m.selected ? (
          <section className="flex flex-col gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4">
            <h2 className="font-serif text-lg font-medium">
              {m.selected.display_name}&rsquo;s codes
            </h2>
            {m.codes.length === 0 ? (
              <p className="text-sm text-[var(--fg-3)]">No codes yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {m.codes.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono tracking-widest">{c.code}</span>
                    <span className="text-sm text-[var(--fg-3)]">
                      {c.seat_cap - c.seats_remaining}/{c.seat_cap} used
                    </span>
                    <Pill kind={c.is_active ? 'sage' : 'default'}>
                      {c.is_active ? 'Active' : 'Retired'}
                    </Pill>
                    {c.is_active ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="quiet"
                        onClick={() => m.openRetire(c.id)}
                      >
                        Retire
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>

      <ConfirmDialog
        open={m.pendingRetire !== null}
        label="Confirm retire code"
        message="Retire this code? New signups will be blocked but existing members keep access."
        confirmLabel="Retire"
        onCancel={m.closeRetire}
        onConfirm={() => void m.confirmRetire()}
      />
    </>
  );
}
