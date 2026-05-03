import type { JSX } from 'react';

import type { Notification } from '../hooks/useNotifications';

import { NotificationItem } from './NotificationItem';

export interface NotificationListProps {
  items: Notification[] | null;
  loading: boolean;
  error: string | null;
  onItemClick: (id: string) => void;
}

export function NotificationList({
  items,
  loading,
  error,
  onItemClick,
}: NotificationListProps): JSX.Element {
  if (loading && items === null) {
    return (
      <div className="space-y-1 p-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-parchment-100" />
        ))}
      </div>
    );
  }
  if (error) {
    return <div className="p-3 text-sm text-ember-600">Couldn&rsquo;t load notifications</div>;
  }
  if (items === null || items.length === 0) {
    return <div className="p-6 text-center text-sm text-[var(--fg-3)]">No notifications yet</div>;
  }
  return (
    <div className="divide-y divide-[var(--border-soft)]">
      {items.map((n) => (
        <NotificationItem key={n.id} notification={n} onClick={onItemClick} />
      ))}
    </div>
  );
}
