import type { JSX } from 'react';
import { Link, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/mod/queue', label: 'Flagged' },
  { to: '/mod/hidden', label: 'Hidden' },
] as const;

export function MobileReportsTabs(): JSX.Element {
  const { pathname } = useLocation();

  return (
    <nav aria-label="Reports tabs" className="flex gap-2 pb-1">
      {TABS.map((t) => {
        const active = pathname === t.to;
        const className = active
          ? 'inline-flex h-9 items-center rounded-full bg-[var(--fg-1)] px-4 text-[13px] font-semibold text-[var(--bg-page)]'
          : 'inline-flex h-9 items-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-raised)] px-4 text-[13px] font-medium text-[var(--fg-2)] active:bg-parchment-100';
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={active ? 'page' : undefined}
            className={className}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
