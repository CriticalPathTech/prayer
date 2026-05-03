import type { JSX } from 'react';

import { CopyCode } from '../components/CopyCode';
import { Pill } from '../components/ui/Pill';
import { useMyInvites } from '../hooks/useMyInvites';

export function MyInvitesPage(): JSX.Element {
  const { data, loading, error } = useMyInvites();

  if (error) {
    return <p className="mx-auto max-w-feed p-6 text-sm text-ember-600">{error}</p>;
  }
  if (loading || !data) {
    return <p className="mx-auto max-w-feed p-6 text-sm text-[var(--fg-3)]">Loading…</p>;
  }

  const hasAnyCode = data.active.length > 0 || data.retired.length > 0;

  return (
    <div className="mx-auto max-w-feed">
      <h1 className="mb-6 font-serif text-[28px] font-semibold tracking-[-0.02em] text-[var(--fg-1)]">
        Invites
      </h1>
      {!hasAnyCode ? (
        <p className="py-16 text-center font-serif text-[18px] text-[var(--fg-3)]">
          No invite codes yet.
        </p>
      ) : null}
      <ul>
        {data.active.map((c) => (
          <li
            key={c.id}
            className="mb-4 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4 shadow-warm-sm"
          >
            <div className="flex items-baseline justify-between gap-3">
              <CopyCode code={c.code} />
              <span className="text-xs text-[var(--fg-3)]">
                {c.seat_cap - c.seats_remaining} of {c.seat_cap} seats used
              </span>
            </div>
            <div className="mt-2">
              <Pill kind="sage">Active</Pill>
            </div>
            {c.redemptions.length > 0 ? (
              <ul className="mt-3 ml-4 list-disc text-sm text-[var(--fg-3)]">
                {c.redemptions.map((r) => (
                  <li key={r.invitee_id}>
                    {r.invitee_display_name}{' '}
                    <span className="text-xs">
                      ({new Date(r.redeemed_at).toLocaleDateString()})
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
        {data.retired.map((c) => (
          <li
            key={c.id}
            className="mb-4 rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] p-4 opacity-70"
          >
            <div className="flex items-baseline justify-between gap-3">
              <CopyCode code={c.code} muted />
              <span className="text-xs text-[var(--fg-3)]">
                {c.seat_cap - c.seats_remaining} of {c.seat_cap} seats used
              </span>
            </div>
            <div className="mt-2">
              <Pill kind="default">Retired</Pill>
            </div>
          </li>
        ))}
      </ul>
      {hasAnyCode ? (
        <p className="mt-8 text-xs text-[var(--fg-3)]">Want more seats? Ask a moderator.</p>
      ) : null}
    </div>
  );
}
