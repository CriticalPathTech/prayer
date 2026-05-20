import type { JSX, ReactNode } from 'react';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Avatar } from '../../components/ui/Avatar';
import { Icon, type IconName } from '../../components/ui/Icon';
import { useAuth } from '../../hooks/useAuth';
import { isPrivilegedRole } from '../../lib/roles';

type Role = 'member' | 'moderator' | 'super_user';
type RoleBadge = { label: string; icon: IconName } | null;

function roleBadge(role: Role | undefined): RoleBadge {
  if (role === 'moderator') return { label: 'Moderator', icon: 'shield' };
  if (role === 'super_user') return { label: 'Super user', icon: 'crown' };
  return null;
}

export interface MobileDrawerProps {
  onClose: () => void;
}

export function MobileDrawer({ onClose }: MobileDrawerProps): JSX.Element {
  const { me, signOut } = useAuth();
  const location = useLocation();
  const displayName = me?.displayName ?? me?.email ?? '?';
  const badge = roleBadge(me?.role);

  // Active-state detection for filter items: only "active" when on / AND ?filter= matches.
  const currentFilter =
    location.pathname === '/'
      ? (new URLSearchParams(location.search).get('filter') ?? 'all')
      : null;

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        data-testid="mobile-drawer-scrim"
        onClick={onClose}
        className="fixed inset-0 z-20 bg-black/30 motion-safe:animate-fade-in"
      />
      <nav
        aria-label="Menu"
        className="fixed inset-y-0 left-0 z-30 flex w-[84%] max-w-[320px] flex-col bg-[var(--bg-raised)] shadow-warm-md"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border-soft)] px-4 py-4">
          <Avatar name={displayName} email={me?.email} avatarUrl={me?.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-serif text-[17px] font-semibold text-[var(--fg-1)]">
              {displayName}
            </div>
            {badge ? (
              <div className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-warm-300 bg-warm-100 px-2 py-0.5 text-[11px] font-medium text-warm-600">
                <Icon name={badge.icon} size={14} />
                <span>{badge.label}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-4 pt-2 text-sm text-[var(--fg-2)]">
          <SectionLabel>Prayer wall</SectionLabel>
          <Item
            to="/"
            icon="pray"
            label="All requests"
            active={currentFilter === 'all'}
            onClose={onClose}
          />
          <Item
            to="/?filter=mine"
            icon="user"
            label="My requests"
            active={currentFilter === 'mine'}
            onClose={onClose}
          />
          <Item
            to="/?filter=answered"
            icon="sunrise"
            label="Answered prayers"
            active={currentFilter === 'answered'}
            onClose={onClose}
          />
          <Item
            to="/me/archive"
            icon="archive"
            label="Archive"
            active={location.pathname === '/me/archive'}
            onClose={onClose}
          />

          <SectionLabel>Account</SectionLabel>
          <Item
            to={`/u/${me?.id}`}
            icon="user"
            label="My profile"
            active={location.pathname === `/u/${me?.id}`}
            onClose={onClose}
          />
          <Item
            to="/me/invites"
            icon="mail"
            label="My invites"
            active={location.pathname === '/me/invites'}
            onClose={onClose}
          />

          {isPrivilegedRole(me?.role) ? (
            <>
              <SectionLabel>Moderation</SectionLabel>
              <Item
                to="/mod/approvals"
                icon="shield"
                label="Moderation"
                active={location.pathname.startsWith('/mod')}
                onClose={onClose}
              />
            </>
          ) : null}

          {me?.role === 'super_user' ? (
            <>
              <SectionLabel>Administration</SectionLabel>
              <Item
                to="/admin/church"
                icon="crown"
                label="Church"
                active={location.pathname === '/admin/church'}
                onClose={onClose}
              />
            </>
          ) : null}

          <div className="mt-2 border-t border-[var(--border-soft)] pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                void signOut();
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-3 text-left text-ember-600 hover:bg-parchment-100"
            >
              <Icon name="log-out" size={18} /> Sign out
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}

function SectionLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="mb-1 mt-3 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--fg-3)]">
      {children}
    </div>
  );
}

interface ItemProps {
  to: string;
  icon: IconName;
  label: string;
  active: boolean;
  onClose: () => void;
}

function Item({ to, icon, label, active, onClose }: ItemProps): JSX.Element {
  const className = [
    'flex items-center gap-2.5 rounded-md px-2 py-3',
    active ? 'bg-parchment-100 font-semibold text-[var(--fg-1)]' : 'hover:bg-parchment-100',
  ].join(' ');
  return (
    <Link
      to={to}
      onClick={onClose}
      aria-current={active ? 'page' : undefined}
      className={className}
    >
      <Icon name={icon} size={18} />
      {label}
    </Link>
  );
}
