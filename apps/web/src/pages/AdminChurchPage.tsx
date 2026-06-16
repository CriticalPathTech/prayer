import { useEffect, useState, type JSX } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { ChangeMemberRoleDialog } from '../components/ChangeMemberRoleDialog';
import { ChurchLogoSettings } from '../components/ChurchLogoSettings';
import { RemoveMemberDialog } from '../components/RemoveMemberDialog';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Field, inputClass } from '../components/ui/Field';
import { Pill } from '../components/ui/Pill';
import { useAuth } from '../hooks/useAuth';
import { useChangeMemberRole } from '../hooks/useChangeMemberRole';
import { useChurchMembers, type MemberRow } from '../hooks/useChurchMembers';
import { useChurchSettings } from '../hooks/useChurchSettings';
import { useRemoveMember } from '../hooks/useRemoveMember';
import { ApiError } from '../lib/api';
import type { Role } from '../lib/roles';

export function AdminChurchPage(): JSX.Element {
  const { me, refreshMe } = useAuth();
  const {
    members,
    currentDisplayName,
    currentRequiresPostApproval,
    superUserCount,
    loading,
    refresh,
  } = useChurchMembers();
  const { updateDisplayName, updateApprovalFlag, saving } = useChurchSettings();
  const { removeMember, removing } = useRemoveMember();
  const { changeRole, saving: changingRole } = useChangeMemberRole();
  const [target, setTarget] = useState<MemberRow | null>(null);
  const [roleTarget, setRoleTarget] = useState<MemberRow | null>(null);
  const [draftName, setDraftName] = useState<string>('');
  const [hydrated, setHydrated] = useState(false);
  const [flagPending, setFlagPending] = useState(false);
  const [flagError, setFlagError] = useState<{ message: string; count?: number } | null>(null);

  // Pre-fill the draft input with the current org name once on first fetch.
  // After save, refresh() updates currentDisplayName which we sync into the
  // draft so the Save button correctly disables (draft === current).
  useEffect(() => {
    if (currentDisplayName === null) return;
    if (!hydrated) {
      setDraftName(currentDisplayName);
      setHydrated(true);
    } else if (draftName === '' || draftName === currentDisplayName) {
      // Sync after save: only overwrite if user hasn't typed something new.
      setDraftName(currentDisplayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDisplayName]);

  if (!me) return <div>Loading…</div>;
  if (me.role !== 'super_user') return <Navigate to="/" replace />;

  const trimmed = draftName.trim();
  const canSave = trimmed.length > 0 && trimmed !== currentDisplayName && !saving;

  async function onSaveSettings(): Promise<void> {
    if (!canSave) return;
    await updateDisplayName(trimmed);
    await refresh();
  }

  async function onConfirmRemove(): Promise<void> {
    if (!target) return;
    try {
      await removeMember(target.id);
      setTarget(null);
      await refresh();
    } catch {
      // error surfaces via the hook's error state; keep dialog open for retry.
    }
  }

  async function onConfirmRoleChange(newRole: Role): Promise<void> {
    if (!roleTarget) return;
    try {
      await changeRole(roleTarget.id, newRole);
      setRoleTarget(null);
      await refresh();
    } catch {
      // Error surfaces via the hook's error state; keep dialog open for retry.
    }
  }

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
        const count = typeof e.detail?.count === 'number' ? e.detail.count : undefined;
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

  return (
    <div className="mx-auto max-w-feed">
      <h1 className="mb-6 font-serif text-[28px] font-semibold tracking-[-0.02em] text-[var(--fg-1)]">
        Church management
      </h1>

      {/* Settings */}
      <section className="mb-8 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4">
        <h2 className="mb-3 font-serif text-lg font-medium">Church settings</h2>
        <Field label="Display name">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={60}
            disabled={currentDisplayName === null}
            className={inputClass}
          />
        </Field>
        <div className="mt-2 flex items-center gap-3">
          <Button onClick={() => void onSaveSettings()} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </section>

      <ChurchLogoSettings />

      {/* Feature flags */}
      <section className="mb-8 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4">
        <h2 className="mb-3 font-serif text-lg font-medium">Feature flags</h2>
        <div className="flex items-start justify-between gap-4">
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
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              currentRequiresPostApproval
                ? 'bg-[var(--color-primary,#7c6a52)]'
                : 'bg-[var(--border-soft)]',
            ].join(' ')}
          >
            <span
              className={[
                'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
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
      </section>

      {/* Members */}
      <section className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4">
        <h2 className="mb-3 font-serif text-lg font-medium">Members</h2>
        {loading ? (
          <div className="text-sm text-[var(--fg-3)]">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--fg-3)]">
                <th className="w-10 py-2"></th>
                <th className="py-2">Name</th>
                <th className="py-2">Email</th>
                <th className="py-2">Role</th>
                <th className="w-24 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-[var(--border-soft)]">
                  <td className="py-2">
                    <Avatar
                      name={m.displayName}
                      email={m.email}
                      avatarUrl={m.avatarUrl}
                      size="sm"
                    />
                  </td>
                  <td className="py-2 text-[var(--fg-1)]">{m.displayName}</td>
                  <td className="py-2 text-[var(--fg-2)]">{m.email}</td>
                  <td className="py-2">
                    <Pill>{m.role}</Pill>
                  </td>
                  <td className="py-2 text-right">
                    {m.id !== me.id ? (
                      <div className="inline-flex gap-2">
                        <Button variant="quiet" onClick={() => setRoleTarget(m)}>
                          Change role
                        </Button>
                        <Button variant="quiet" onClick={() => setTarget(m)}>
                          Remove
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {target ? (
        <RemoveMemberDialog
          member={target}
          onConfirm={() => void onConfirmRemove()}
          onCancel={() => setTarget(null)}
          removing={removing}
        />
      ) : null}
      {roleTarget ? (
        <ChangeMemberRoleDialog
          member={roleTarget}
          superUserCount={superUserCount}
          onConfirm={(newRole) => void onConfirmRoleChange(newRole)}
          onCancel={() => setRoleTarget(null)}
          saving={changingRole}
        />
      ) : null}
    </div>
  );
}
