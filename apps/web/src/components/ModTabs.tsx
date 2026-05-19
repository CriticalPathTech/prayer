import type { JSX } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

interface TabDef {
  to: string;
  label: string;
  /** When true, only shown if org.requiresPostApproval is true */
  gated?: boolean;
}

const ALL_TABS: TabDef[] = [
  { to: '/mod/queue', label: 'Flagged' },
  { to: '/mod/approvals', label: 'Pending approval', gated: true },
  { to: '/mod/invites', label: 'Invites' },
];

export function ModTabs(): JSX.Element {
  const { pathname } = useLocation();
  const { me } = useAuth();

  const tabs = ALL_TABS.filter((t) => !t.gated || me?.orgRequiresPostApproval === true);

  return (
    <nav className="mb-6 flex gap-6 border-b border-[var(--border-soft)] pb-2 text-sm">
      {tabs.map((t) => {
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
