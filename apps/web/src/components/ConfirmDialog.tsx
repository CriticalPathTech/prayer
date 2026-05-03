import type { JSX } from 'react';
import { useEffect, useId, useRef } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (destructive) confirmRef.current?.focus();
      else cancelRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open, destructive]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const confirmClass = destructive
    ? 'rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600'
    : 'rounded bg-vesper-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-vesper-600 disabled:opacity-50 disabled:hover:bg-vesper-500';

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <button
        type="button"
        data-testid="confirm-dialog-backdrop"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div
        role="alertdialog"
        aria-labelledby={titleId}
        className="relative w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-[var(--border-soft)] bg-[var(--bg-raised)] p-5 shadow-warm-md"
      >
        <h2 id={titleId} className="mb-1 text-base font-semibold text-[var(--fg-1)]">
          {title}
        </h2>
        {body ? (
          <p className="mb-4 text-sm text-[var(--fg-2)]">{body}</p>
        ) : (
          <div className="mb-4" />
        )}
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded border border-[var(--border-soft)] bg-transparent px-3 py-1.5 text-sm text-[var(--fg-2)] hover:bg-parchment-100 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={confirmClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
