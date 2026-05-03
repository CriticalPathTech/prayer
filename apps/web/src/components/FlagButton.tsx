import type { FlagReason } from '@prayer/shared';
import type { JSX } from 'react';
import { useState } from 'react';

import { useFlagAction } from '../hooks/useFlagAction';

import { FlagModal } from './FlagModal';
import { Icon } from './ui/Icon';

export interface FlagButtonProps {
  targetType: 'post' | 'comment';
  postId: string;
  targetId: string;
}

export function FlagButton({ targetType, postId, targetId }: FlagButtonProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const flag = useFlagAction();

  async function handleSubmit(input: { reason: FlagReason; note?: string }): Promise<void> {
    try {
      await flag.submit({
        targetType,
        postId,
        targetId,
        reason: input.reason,
        ...(input.note !== undefined ? { note: input.note } : {}),
      });
      setSubmitted(true);
    } catch {
      // useFlagAction surfaces error via its state; modal closes regardless per UX.
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={submitted}
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-[var(--fg-3)] hover:text-[var(--fg-1)] hover:bg-parchment-100 transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-[var(--fg-3)]"
      >
        <Icon name="flag" size={16} />
        <span>{submitted ? 'Reported' : 'Report'}</span>
      </button>
      <FlagModal open={open} onClose={() => setOpen(false)} onSubmit={handleSubmit} />
    </>
  );
}
