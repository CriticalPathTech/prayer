import type { JSX } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

interface TabDef {
  to: string;
  label: string;
  /** When true, only shown if org.requiresPostApproval is true */
  gated?: boolean;
}

// Order is by expected usage frequency for a moderator: time-sensitive
// approvals queue first, then invites, then the two reactive surfaces.
const ALL_TABS: TabDef[] = [
  { to: '/mod/approvals', label: 'Pending approval', gated: true },
  { to: '/mod/follow-up', label: 'Follow-up' },
  { to: '/mod/invites', label: 'Invites' },
  { to: '/mod/queue', label: 'Flagged' },
  { to: '/mod/hidden', label: 'Hidden' },
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

/** First mod route a moderator should land on: Pending approval when the
 * gate is on (the most time-sensitive queue), Flagged otherwise. Used by
 * the header "Moderation" link and the bare `/mod` redirect. */
export function getDefaultModRoute(requiresPostApproval: boolean): string {
  return requiresPostApproval ? '/mod/approvals' : '/mod/queue';
}
