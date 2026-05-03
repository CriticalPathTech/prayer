import type { JSX } from 'react';
import { Link, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/mod/queue', label: 'Queue' },
  { to: '/mod/invites', label: 'Invites' },
];

export function ModTabs(): JSX.Element {
  const { pathname } = useLocation();
  return (
    <nav className="mb-6 flex gap-6 border-b border-[var(--border-soft)] pb-2 text-sm">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.to);
        return (
          <Link
            key={t.to}
            to={t.to}
            className={
              active
                ? 'underline font-medium text-[var(--fg-1)]'
                : 'text-[var(--fg-3)] hover:text-[var(--fg-2)]'
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
