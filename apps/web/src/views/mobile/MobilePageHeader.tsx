import type { JSX, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Icon } from '../../components/ui/Icon';
import { LogoMark } from '../../components/ui/LogoMark';

type Variant =
  | { kind: 'feed'; onMenu: () => void; unreadCount: number; brandLabel?: string }
  | { kind: 'back'; title: string; onBack?: () => void; right?: ReactNode }
  | { kind: 'close'; title: string; onClose?: () => void; right?: ReactNode };

export interface MobilePageHeaderProps {
  variant: Variant;
}

export function MobilePageHeader({ variant }: MobilePageHeaderProps): JSX.Element {
  const navigate = useNavigate();

  if (variant.kind === 'feed') {
    return (
      <header
        className="sticky top-0 z-10 grid h-14 grid-cols-[1fr_auto_1fr] items-center bg-[var(--bg-page)] px-2"
        style={{ boxShadow: '0 1px 0 var(--border-soft)' }}
      >
        <div className="flex items-center">
          <button
            type="button"
            aria-label="Menu"
            onClick={variant.onMenu}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--fg-1)] active:bg-parchment-100"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h10" />
            </svg>
          </button>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-serif text-[19px] font-semibold tracking-[-0.02em] text-[var(--fg-1)] no-underline"
        >
          <LogoMark size={20} />
          <span>{variant.brandLabel || 'Prayer'}</span>
        </Link>
        <div className="flex items-center justify-end">
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => navigate('/notifications')}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--fg-1)] active:bg-parchment-100"
          >
            <Icon name="bell" size={20} />
            {variant.unreadCount > 0 ? (
              <span
                data-testid="mobile-bell-dot"
                aria-hidden
                className="absolute right-[10px] top-[10px] h-2 w-2 rounded-full bg-ember-500"
                style={{ boxShadow: '0 0 0 2px var(--bg-page)' }}
              />
            ) : null}
          </button>
          <Link
            to="/compose"
            aria-label="New request"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--fg-1)] active:bg-parchment-100"
          >
            <Icon name="pen" size={20} />
          </Link>
        </div>
      </header>
    );
  }

  if (variant.kind === 'back') {
    return (
      <header
        className="sticky top-0 z-10 grid h-14 grid-cols-[1fr_auto_1fr] items-center bg-[var(--bg-page)] px-2"
        style={{ boxShadow: '0 1px 0 var(--border-soft)' }}
      >
        <div className="flex items-center">
          <button
            type="button"
            aria-label="Back"
            onClick={() => (variant.onBack ? variant.onBack() : navigate(-1))}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--fg-1)] active:bg-parchment-100"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>
        <span className="font-serif text-[17px] font-semibold tracking-[-0.02em] text-[var(--fg-1)]">
          {variant.title}
        </span>
        <div className="flex items-center justify-end">{variant.right ?? null}</div>
      </header>
    );
  }

  // kind === 'close'
  return (
    <header
      className="sticky top-0 z-10 grid h-14 grid-cols-[1fr_auto_1fr] items-center bg-[var(--bg-page)] px-2"
      style={{ boxShadow: '0 1px 0 var(--border-soft)' }}
    >
      <div className="flex items-center">
        <button
          type="button"
          aria-label="Close"
          onClick={() => (variant.onClose ? variant.onClose() : navigate(-1))}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--fg-1)] active:bg-parchment-100"
        >
          <Icon name="x" size={24} />
        </button>
      </div>
      <span className="font-serif text-[17px] font-semibold tracking-[-0.02em] text-[var(--fg-1)]">
        {variant.title}
      </span>
      <div className="flex items-center justify-end">{variant.right ?? null}</div>
    </header>
  );
}
