import { useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { useChurchMembers } from '../../hooks/useChurchMembers';
import { useChurchSettings } from '../../hooks/useChurchSettings';
import { ApiError } from '../../lib/api';

import { MobilePageHeader } from './MobilePageHeader';

export function MobileAdminChurchPage(): JSX.Element {
  const navigate = useNavigate();
  const { me, refreshMe } = useAuth();
  const { currentDisplayName, currentRequiresPostApproval, refresh } = useChurchMembers();
  const { updateApprovalFlag, saving } = useChurchSettings();
  const [flagPending, setFlagPending] = useState(false);
  const [flagError, setFlagError] = useState<{ message: string; count?: number } | null>(null);

  const desktopUrl =
    typeof window !== 'undefined'
      ? `https://${window.location.hostname}/admin/church`
      : 'https://<your-host>/admin/church';

  async function onToggleApprovalFlag(): Promise<void> {
    if (flagPending || saving) return;
    const desired = !currentRequiresPostApproval;
    setFlagPending(true);
    setFlagError(null);
    try {
      await updateApprovalFlag(currentDisplayName ?? '', desired);
      await refresh();
      await refreshMe();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PENDING_POSTS_EXIST') {
        const count =
          typeof e.detail?.count === 'number' ? e.detail.count : undefined;
        setFlagError({
          message: `You have ${count ?? 'a few'} pending request(s) waiting for moderator review. Approve or reject them before turning the gate off.`,
          ...(count !== undefined ? { count } : {}),
        });
      } else {
        setFlagError({ message: "Couldn't save. Try again." });
      }
    } finally {
      setFlagPending(false);
    }
  }

  const isSuperUser = me?.role === 'super_user';

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-page)] text-[var(--fg-2)] font-sans">
      <MobilePageHeader
        variant={{ kind: 'close', title: 'Church admin', onClose: () => navigate('/') }}
      />

      {isSuperUser ? (
        <div className="flex-1 px-4 py-6">
          {/* Feature flags */}
          <h2 className="mb-3 font-serif text-base font-semibold text-[var(--fg-1)]">
            Feature flags
          </h2>
          <div
            className="flex items-center justify-between gap-4 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] px-4 py-4"
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--fg-1)]">
                Require moderator approval for new prayer requests
              </p>
              <p className="mt-0.5 text-xs text-[var(--fg-3)]">
                When on, new posts from members enter an approval queue for a moderator to review
                before they appear on the wall.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={currentRequiresPostApproval}
              aria-label="Require moderator approval for new prayer requests"
              disabled={flagPending || saving}
              onClick={() => void onToggleApprovalFlag()}
              className={[
                'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                currentRequiresPostApproval
                  ? 'bg-[var(--color-primary,#7c6a52)]'
                  : 'bg-[var(--border-soft)]',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
                  currentRequiresPostApproval ? 'translate-x-5' : 'translate-x-0.5',
                ].join(' ')}
              />
            </button>
          </div>
          {flagError ? (
            <div
              role="alert"
              className="mt-3 rounded border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 py-2 text-sm text-[var(--fg-2)]"
            >
              {flagError.count !== undefined ? (
                <>
                  {flagError.message}{' '}
                  <Link to="/mod/approvals" className="underline text-[var(--fg-1)]">
                    Go to approvals
                  </Link>
                </>
              ) : (
                flagError.message
              )}
            </div>
          ) : null}

          {/* Members management: desktop only */}
          <div className="mt-8 flex flex-col items-center gap-4 text-center">
            <h2 className="font-serif text-[18px] text-[var(--fg-1)]">
              Full admin: desktop only
            </h2>
            <p className="max-w-sm text-sm text-[var(--fg-3)]">
              Member management and church settings are desktop-only tools. Please sign in from a
              laptop or desktop browser to manage members.
            </p>
            <p className="max-w-sm break-all text-xs text-[var(--fg-4)]">
              <code className="font-mono">{desktopUrl}</code>
            </p>
            <Button type="button" onClick={() => navigate('/')}>
              Back to feed
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-6 text-center">
          <h1 className="font-serif text-[20px] text-[var(--fg-1)]">Desktop only</h1>
          <p className="max-w-sm text-sm text-[var(--fg-3)]">
            Church management is a desktop-only tool. Please sign in from a laptop or desktop
            browser to manage members and church settings.
          </p>
          <p className="max-w-sm break-all text-xs text-[var(--fg-4)]">
            <code className="font-mono">{desktopUrl}</code>
          </p>
          <Button type="button" onClick={() => navigate('/')}>
            Back to feed
          </Button>
        </div>
      )}
    </div>
  );
}
