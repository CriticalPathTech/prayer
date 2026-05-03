import type { JSX } from 'react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import { useModQueue } from '../../hooks/useModQueue';
import { isPrivilegedRole } from '../../lib/roles';

import { MobilePageHeader } from './MobilePageHeader';

type Status = 'pending' | 'auto_hidden' | 'manually_hidden';
const TABS: Status[] = ['pending', 'auto_hidden', 'manually_hidden'];
const LABELS: Record<Status, string> = {
  pending: 'Pending',
  auto_hidden: 'Auto-hidden',
  manually_hidden: 'Manually hidden',
};

function pillClass(active: boolean): string {
  return [
    'inline-flex h-9 items-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium',
    active
      ? 'bg-[var(--fg-1)] text-[var(--bg-page)]'
      : 'border border-[var(--border-soft)] bg-[var(--bg-raised)] text-[var(--fg-2)]',
  ].join(' ');
}

export function MobileModQueuePage(): JSX.Element {
  const { me } = useAuth();
  const [status, setStatus] = useState<Status>('pending');
  const queue = useModQueue(status);

  if (!me) {
    return (
      <>
        <MobilePageHeader variant={{ kind: 'back', title: 'Reports' }} />
        <div className="px-4 py-16 text-center text-sm text-[var(--fg-3)]">Loading…</div>
      </>
    );
  }
  if (!isPrivilegedRole(me.role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <MobilePageHeader variant={{ kind: 'back', title: 'Reports' }} />
      <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-3">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setStatus(t)}
              className={pillClass(status === t)}
            >
              {LABELS[t]}
            </button>
          ))}
        </div>

        {queue.loading ? (
          <p className="py-4 text-center text-sm text-[var(--fg-3)]">Loading…</p>
        ) : null}
        {queue.error ? <p className="text-sm text-ember-600">{queue.error}</p> : null}
        {!queue.loading && queue.items.length === 0 ? (
          <p className="py-16 text-center font-serif text-[18px] text-[var(--fg-3)]">
            Nothing here.
          </p>
        ) : null}

        {queue.items.map((it) => (
          <article
            key={`${it.target_type}-${it.target_id}`}
            className="flex flex-col gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-3 shadow-warm-sm"
          >
            <p className="text-xs text-[var(--fg-3)]">
              {it.target_type} · {it.flag_count} flag{it.flag_count === 1 ? '' : 's'} ·{' '}
              {it.reasons.join(', ')}
            </p>
            <p className="line-clamp-2 text-sm text-[var(--fg-2)]">{it.preview}</p>
            <div className="flex flex-wrap gap-2">
              {!it.hidden ? (
                <button
                  type="button"
                  onClick={() => void queue.hideTarget(it.target_type, it.target_id)}
                  className="inline-flex h-9 items-center rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 text-[13px] font-medium text-[var(--fg-2)] active:bg-parchment-100"
                >
                  Hide
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void queue.unhideTarget(it.target_type, it.target_id)}
                  className="inline-flex h-9 items-center rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 text-[13px] font-medium text-[var(--fg-2)] active:bg-parchment-100"
                >
                  Unhide
                </button>
              )}
              <button
                type="button"
                onClick={() => void queue.dismissFlags(it.target_type, it.target_id)}
                className="inline-flex h-9 items-center rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 text-[13px] font-medium text-[var(--fg-2)] active:bg-parchment-100"
              >
                Dismiss
              </button>
              <Link
                to={`/posts/${it.post_id}`}
                className="inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium text-vesper-600 active:bg-parchment-100"
              >
                Open thread →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
