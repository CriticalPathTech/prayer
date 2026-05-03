import type { JSX, ReactNode } from 'react';

import { Button } from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  /** Used as `aria-label` on the dialog. */
  label: string;
  message: ReactNode;
  confirmLabel: string;
  /** Shown on the confirm button while `busy` is true (e.g. "Removing…"). */
  busyLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  label,
  message,
  confirmLabel,
  busyLabel,
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-6 shadow-warm-sm">
        <p className="mb-4 text-sm text-[var(--fg-2)]">{message}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="quiet" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy}>
            {busy && busyLabel ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
