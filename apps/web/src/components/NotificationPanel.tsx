import type { JSX } from 'react';

import type { Notification } from '../hooks/useNotifications';

import { NotificationList } from './NotificationList';
import { Button } from './ui/Button';

export interface NotificationPanelProps {
  items: Notification[] | null;
  loading: boolean;
  error: string | null;
  onMarkAllRead: () => void;
  onItemClick: (id: string) => void;
  onClose: () => void;
}

export function NotificationPanel({
  items,
  loading,
  error,
  onMarkAllRead,
  onItemClick,
  onClose,
}: NotificationPanelProps): JSX.Element {
  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-10 cursor-default bg-transparent"
        onClick={onClose}
        aria-label="Close notifications"
      />
      <div
        role="dialog"
        aria-label="Notifications"
        className="absolute right-0 top-full z-20 mt-2 max-h-[480px] w-96 overflow-auto rounded-lg border border-[var(--border-soft)] bg-[var(--bg-raised)] shadow-warm-md motion-safe:animate-fade-in"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-3 py-2.5">
          <div className="font-serif text-sm font-semibold text-[var(--fg-1)]">Notifications</div>
          <Button variant="quiet" size="sm" onClick={onMarkAllRead}>
            Mark all read
          </Button>
        </div>
        <NotificationList items={items} loading={loading} error={error} onItemClick={onItemClick} />
      </div>
    </>
  );
}
