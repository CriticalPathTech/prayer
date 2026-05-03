import { FLAG_REASONS, type FlagReason } from '@prayer/shared';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';

export interface FlagModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { reason: FlagReason; note?: string }) => Promise<void>;
}

const LABELS: Record<FlagReason, string> = {
  inappropriate: 'Inappropriate',
  off_topic: 'Off-topic',
  hateful: 'Hateful',
  other: 'Other',
};

export function FlagModal({ open, onClose, onSubmit }: FlagModalProps): JSX.Element | null {
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), button, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;
  const disabled = !reason || loading || (reason === 'other' && note.trim().length === 0);
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="Report content"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40"
    >
      <div className="w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-[var(--border-soft)] bg-[var(--bg-raised)] p-5 shadow-warm-md">
        <h2 className="mb-2 text-lg font-semibold">Report content</h2>
        <div className="space-y-1">
          {FLAG_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              <span>{LABELS[r]}</span>
            </label>
          ))}
        </div>
        <textarea
          className="mt-2 w-full rounded border px-2 py-1 text-sm"
          placeholder={reason === 'other' ? 'Required note…' : 'Optional note'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          rows={3}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1 text-sm">
            Cancel
          </button>
          <button
            disabled={disabled}
            onClick={async () => {
              if (!reason) return;
              setLoading(true);
              try {
                await onSubmit({ reason, ...(note.trim().length > 0 ? { note } : {}) });
                onClose();
              } finally {
                setLoading(false);
              }
            }}
            className="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
