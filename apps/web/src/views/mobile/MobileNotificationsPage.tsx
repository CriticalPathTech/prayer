import type { JSX } from 'react';
import { useEffect } from 'react';

import { NotificationItem } from '../../components/NotificationItem';
import { type Notification, useNotifications } from '../../hooks/useNotifications';

import { MobilePageHeader } from './MobilePageHeader';

const ONE_DAY = 24 * 3600_000;

function isToday(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < ONE_DAY;
}

export function MobileNotificationsPage(): JSX.Element {
  const { items, loading, error, fetchList, markAllRead, markRead } = useNotifications();

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const list: Notification[] = items ?? [];
  const today = list.filter((n) => isToday(n.created_at));
  const earlier = list.filter((n) => !isToday(n.created_at));

  function onItemClick(id: string): void {
    void markRead(id).catch(() => {});
  }

  return (
    <>
      <MobilePageHeader
        variant={{
          kind: 'back',
          title: 'Notifications',
          right: (
            <button
              type="button"
              onClick={() => void markAllRead().catch(() => {})}
              className="text-sm font-medium text-vesper-600"
            >
              Mark all read
            </button>
          ),
        }}
      />
      <div className="flex flex-1 flex-col gap-2 px-4 pb-6 pt-3">
        {error ? <p className="text-sm text-ember-600">{error}</p> : null}
        {loading && list.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--fg-3)]">Loading…</p>
        ) : null}
        {!loading && list.length === 0 ? (
          <p className="py-16 text-center font-serif text-[18px] text-[var(--fg-3)]">
            Nothing yet.
          </p>
        ) : null}

        {today.length > 0 ? (
          <>
            <SectionLabel>Today</SectionLabel>
            {today.map((n) => (
              <NotificationItem key={n.id} notification={n} onClick={onItemClick} />
            ))}
          </>
        ) : null}
        {earlier.length > 0 ? (
          <>
            <SectionLabel>Earlier</SectionLabel>
            {earlier.map((n) => (
              <NotificationItem key={n.id} notification={n} onClick={onItemClick} />
            ))}
          </>
        ) : null}
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="mt-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--fg-3)]">
      {children}
    </div>
  );
}
