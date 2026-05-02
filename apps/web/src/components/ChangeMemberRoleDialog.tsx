import { useEffect, useId, useState, type JSX } from 'react';

import type { MemberRow } from '../hooks/useChurchMembers';
import type { Role } from '../lib/roles';

import { Avatar } from './ui/Avatar';

export type { Role };

export interface ChangeMemberRoleDialogProps {
  member: MemberRow;
  superUserCount: number;
  onConfirm: (role: Role) => void;
  onCancel: () => void;
  saving?: boolean;
}

const SUPER_USER_CAP = 3;

export function ChangeMemberRoleDialog({
  member,
  superUserCount,
  onConfirm,
  onCancel,
  saving = false,
}: ChangeMemberRoleDialogProps): JSX.Element {
  const titleId = useId();
  const selectId = useId();
  const confirmId = useId();
  const [selectedRole, setSelectedRole] = useState<Role>(member.role);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !saving) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, onCancel]);

  const isPromoteToSuperUser = selectedRole === 'super_user' && member.role !== 'super_user';
  const isDemoteFromSuperUser = member.role === 'super_user' && selectedRole !== 'super_user';
  const capReached = superUserCount >= SUPER_USER_CAP;
  const lastSuperUser = superUserCount <= 1;

  // Disable the super_user option when at cap (unless target is already super_user).
  const superUserDisabled = capReached && member.role !== 'super_user';
  // Demote of last super_user is blocked. Save disables; dropdown still shows the option.
  const wouldUnderflow = isDemoteFromSuperUser && lastSuperUser;

  const noChange = selectedRole === member.role;
  const needsTypeConfirm = isPromoteToSuperUser;
  const typeConfirmOk = !needsTypeConfirm || confirmText === member.email;

  const canSave = !noChange && !wouldUnderflow && !superUserDisabled && typeConfirmOk && !saving;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (!saving) onCancel();
        }}
      />
      <div
        role="alertdialog"
        aria-labelledby={titleId}
        className="relative w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-[var(--border-soft)] bg-[var(--bg-raised)] p-5 shadow-warm-md"
      >
        <h2 id={titleId} className="mb-3 text-base font-semibold text-[var(--fg-1)]">
          Change role
        </h2>

        <div className="mb-4 flex items-center gap-3">
          <Avatar
            name={member.displayName}
            email={member.email}
            avatarUrl={member.avatarUrl}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-[var(--fg-1)]">{member.displayName}</div>
            <div className="truncate text-sm text-[var(--fg-2)]">{member.email}</div>
            <div className="text-xs uppercase tracking-wide text-[var(--fg-3)]">{member.role}</div>
          </div>
        </div>

        <label htmlFor={selectId} className="mb-1 block text-sm text-[var(--fg-2)]">
          New role:
        </label>
        <select
          id={selectId}
          value={selectedRole}
          onChange={(e) => {
            setSelectedRole(e.target.value as Role);
            setConfirmText('');
          }}
          className="mb-2 w-full rounded border border-[var(--border-soft)] bg-transparent px-2 py-1.5 text-sm text-[var(--fg-1)]"
        >
          <option value="member">member</option>
          <option value="moderator">moderator</option>
          <option value="super_user" disabled={superUserDisabled}>
            super_user
          </option>
        </select>

        <p className="mb-4 text-xs text-[var(--fg-3)]">
          {superUserCount} of {SUPER_USER_CAP} super_users used
          {capReached && member.role !== 'super_user'
            ? ' — promote not available, demote one first'
            : ''}
          {wouldUnderflow ? ' — cannot demote the last super_user' : ''}
        </p>

        {needsTypeConfirm ? (
          <div className="mb-4">
            <label htmlFor={confirmId} className="mb-1 block text-sm text-[var(--fg-2)]">
              Promoting to super_user. Type <code className="font-mono">{member.email}</code> to
              confirm:
            </label>
            <input
              id={confirmId}
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded border border-[var(--border-soft)] bg-transparent px-2 py-1.5 text-sm text-[var(--fg-1)]"
            />
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="rounded border border-[var(--border-soft)] bg-transparent px-3 py-1.5 text-sm text-[var(--fg-2)] hover:bg-parchment-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onConfirm(selectedRole)}
            className="rounded bg-vesper-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-vesper-600 disabled:opacity-50 disabled:hover:bg-vesper-500"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
