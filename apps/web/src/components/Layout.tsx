import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { displayedOrgName } from '../lib/org';
import { isPrivilegedRole } from '../lib/roles';

import { NotificationBell } from './NotificationBell';
import { NotificationPanel } from './NotificationPanel';
import { Avatar } from './ui/Avatar';
import { Icon, type IconName } from './ui/Icon';

type RoleBadge = { label: string; icon: IconName } | null;

function roleBadge(role: 'member' | 'moderator' | 'super_user' | undefined): RoleBadge {
  if (role === 'moderator') return { label: 'Moderator', icon: 'shield' };
  if (role === 'super_user') return { label: 'Super user', icon: 'crown' };
  return null;
}

export function Layout(): JSX.Element {
  const { me, signOut } = useAuth();
  const notif = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  async function handleNotifOpen(): Promise<void> {
    if (!notifOpen) await notif.fetchList();
    setNotifOpen((v) => !v);
  }

  const canMod = isPrivilegedRole(me?.role);
  const badge = roleBadge(me?.role);
  const displayName = me?.displayName ?? me?.email ?? '?';
  const headerLabel = displayedOrgName(me?.orgDisplayName) || 'Prayer';

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--fg-2)] font-sans">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-[var(--bg-raised)] focus:px-3 focus:py-1.5 focus:text-sm focus:text-[var(--fg-1)] focus:shadow-warm-md focus:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        Skip to main content
      </a>
      <header className="bg-[var(--bg-raised)] border-b border-[var(--border-soft)]">
        <div className="mx-auto flex max-w-[960px] items-center gap-4 px-5 py-3.5">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 font-serif font-semibold text-[22px] tracking-[-0.02em] text-[var(--fg-1)] no-underline"
          >
            <Icon name="pray" size={20} aria-hidden />
            <span>{headerLabel}</span>
          </Link>
          <div className="flex-1" />
          <nav className="flex items-center gap-1 text-sm">
            {canMod ? (
              <Link
                to="/mod/queue"
                className="inline-flex text-[var(--fg-3)] hover:text-[var(--fg-1)] hover:bg-parchment-100 font-medium px-2.5 py-1.5 rounded-sm"
              >
                Moderation
              </Link>
            ) : null}
            {me?.role === 'super_user' ? (
              <Link
                to="/admin/church"
                className="inline-flex text-[var(--fg-3)] hover:text-[var(--fg-1)] hover:bg-parchment-100 font-medium px-2.5 py-1.5 rounded-sm"
              >
                Church
              </Link>
            ) : null}
            <div className="relative">
              <NotificationBell
                unreadCount={notif.unreadCount}
                onClick={() => void handleNotifOpen()}
                open={notifOpen}
              />
              {notifOpen ? (
                <NotificationPanel
                  items={notif.items}
                  loading={notif.loading}
                  error={notif.error}
                  onMarkAllRead={() => void notif.markAllRead().catch(() => {})}
                  onItemClick={(id) => {
                    void notif.markRead(id).catch(() => {});
                    setNotifOpen(false);
                  }}
                  onClose={() => setNotifOpen(false)}
                />
              ) : null}
            </div>
            {badge ? (
              <span
                aria-label={badge.label}
                title={badge.label}
                className="ml-2 inline-flex items-center gap-1 rounded-full border border-warm-300 bg-warm-100 px-2 py-0.5 text-[12px] font-medium text-warm-500"
              >
                <Icon name={badge.icon} size={14} />
                <span className="inline">{badge.label}</span>
              </span>
            ) : null}
            <div ref={menuRef} className="relative ml-1.5">
              <button
                type="button"
                aria-label={`Account menu for ${displayName}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-full focus:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                <Avatar name={displayName} email={me?.email} avatarUrl={me?.avatarUrl} size="sm" />
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  aria-label="Account menu"
                  className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--bg-raised)] shadow-warm-md motion-safe:animate-fade-in"
                >
                  <div className="border-b border-[var(--border-soft)] px-3 py-2.5">
                    <div className="truncate font-serif text-sm font-semibold text-[var(--fg-1)]">
                      {me?.displayName ?? 'Guest'}
                    </div>
                    {me?.email ? (
                      <div className="truncate text-xs text-[var(--fg-3)]">{me.email}</div>
                    ) : null}
                  </div>
                  <Link
                    to="/me/archive"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--fg-2)] hover:bg-parchment-100 hover:text-[var(--fg-1)]"
                  >
                    <Icon name="archive" size={16} />
                    <span>Archive</span>
                  </Link>
                  <div className="border-t border-[var(--border-soft)]" />
                  <Link
                    to="/me/invites"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--fg-2)] hover:bg-parchment-100 hover:text-[var(--fg-1)]"
                  >
                    <Icon name="mail" size={16} />
                    <span>Invites</span>
                  </Link>
                  <Link
                    to="/me/profile"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--fg-2)] hover:bg-parchment-100 hover:text-[var(--fg-1)]"
                  >
                    <Icon name="user" size={16} />
                    <span>Profile</span>
                  </Link>
                  <Link
                    to="/me/security"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--fg-2)] hover:bg-parchment-100 hover:text-[var(--fg-1)]"
                  >
                    <Icon name="shield" size={16} />
                    <span>Security</span>
                  </Link>
                </div>
              ) : null}
            </div>
            <span aria-hidden className="mx-1 h-6 w-px bg-[var(--border-soft)]" />
            <button
              type="button"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => void signOut()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-[var(--fg-3)] hover:bg-parchment-100 hover:text-[var(--fg-1)] focus:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <Icon name="log-out" size={16} />
            </button>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[960px] px-5 py-7">
        <Outlet />
      </main>
    </div>
  );
}
