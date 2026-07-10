import type { ExtendDurationDays } from '@prayer/shared';
import type { JSX } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import { DEFAULT_PIN_DAYS, PinDurationPicker } from './PinDurationPicker';

export interface ExtendDialogProps {
  open: boolean;
  /** True when the target prayer has already auto-archived — the copy then
   * frames the action as bringing it back rather than just extending. */
  wasArchived?: boolean;
  onCancel: () => void;
  onConfirm: (durationDays: ExtendDurationDays) => Promise<void> | void;
}

export function ExtendDialog({
  open,
  wasArchived = false,
  onCancel,
  onConfirm,
}: ExtendDialogProps): JSX.Element | null {
  const [days, setDays] = useState<number>(DEFAULT_PIN_DAYS);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      cancelRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  async function handle(): Promise<void> {
    setBusy(true);
    try {
      await onConfirm(days as ExtendDurationDays);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <button
        type="button"
        data-testid="extend-dialog-backdrop"
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
          {wasArchived ? 'Bring this prayer back' : 'Extend this prayer'}
        </h2>
        <div className="mb-4 flex flex-col gap-2 text-sm text-[var(--fg-2)]">
          <span>
            {wasArchived ? 'Return it to the wall and keep it visible for…' : 'Extend it by…'}
          </span>
          <PinDurationPicker value={days} onChange={setDays} />
        </div>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded border border-[var(--border-soft)] bg-transparent px-3 py-1.5 text-sm text-[var(--fg-2)] hover:bg-parchment-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handle()}
            className="rounded bg-vesper-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-vesper-600 disabled:opacity-50 disabled:hover:bg-vesper-500"
          >
            {wasArchived ? 'Bring back' : 'Extend'}
          </button>
        </div>
      </div>
    </div>
  );
}
