import type { JSX } from 'react';

import { Icon } from './ui/Icon';

export interface NotificationBellProps {
  unreadCount: number;
  onClick: () => void;
  open: boolean;
}

export function NotificationBell({
  unreadCount,
  onClick,
  open,
}: NotificationBellProps): JSX.Element {
  const label = unreadCount === 0 ? 'notifications' : `${unreadCount} unread notifications`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      onClick={onClick}
      className="relative inline-flex items-center justify-center rounded-sm p-1.5 text-[var(--fg-3)] hover:bg-parchment-100 hover:text-[var(--fg-1)] transition-colors focus:outline-none focus-visible:shadow-[var(--focus-ring)]"
    >
      <Icon name="bell" size={18} />
      {unreadCount > 0 ? (
        <span
          aria-hidden
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-vesper-500 ring-2 ring-[var(--bg-raised)]"
        />
      ) : null}
    </button>
  );
}
