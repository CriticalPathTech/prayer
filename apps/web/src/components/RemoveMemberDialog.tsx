import { useEffect, useId, useState, type JSX } from 'react';

import type { MemberRow } from '../hooks/useChurchMembers';

import { Avatar } from './ui/Avatar';

export interface RemoveMemberDialogProps {
  member: MemberRow;
  onConfirm: () => void;
  onCancel: () => void;
  removing?: boolean;
}

export function RemoveMemberDialog({
  member,
  onConfirm,
  onCancel,
  removing = false,
}: RemoveMemberDialogProps): JSX.Element {
  const [confirmText, setConfirmText] = useState('');
  const titleId = useId();
  const inputId = useId();
  const canRemove = confirmText === member.email && !removing;

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !removing) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [removing, onCancel]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (!removing) onCancel();
        }}
      />
      <div
        role="alertdialog"
        aria-labelledby={titleId}
        className="relative w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-[var(--border-soft)] bg-[var(--bg-raised)] p-5 shadow-warm-md"
      >
        <h2 id={titleId} className="mb-3 text-base font-semibold text-[var(--fg-1)]">
          Remove member
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

        <p className="mb-4 text-sm text-[var(--fg-2)]">
          This removes them from the church. Posts and comments they authored stay but show as{' '}
          <em>Former member</em>. Their unused invite codes will stop working.
        </p>

        <label htmlFor={inputId} className="mb-1 block text-sm text-[var(--fg-2)]">
          Type <code className="font-mono">{member.email}</code> to confirm:
        </label>
        <input
          id={inputId}
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="mb-4 w-full rounded border border-[var(--border-soft)] bg-transparent px-2 py-1.5 text-sm text-[var(--fg-1)]"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={removing}
            onClick={onCancel}
            className="rounded border border-[var(--border-soft)] bg-transparent px-3 py-1.5 text-sm text-[var(--fg-2)] hover:bg-parchment-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canRemove}
            onClick={onConfirm}
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600"
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}
