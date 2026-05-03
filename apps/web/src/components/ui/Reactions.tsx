import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';

import { Icon } from './Icon';

const EMOJI_SET = ['🙏', '❤️', '💪', '😢', '✝️', '🙌'] as const;
export type Emoji = (typeof EMOJI_SET)[number];

const SENTIMENTS: Record<Emoji, string> = {
  '🙏': 'I am praying for this',
  '❤️': 'Love and support',
  '💪': 'Strength with you',
  '😢': 'Grieving with you',
  '✝️': 'Amen, in agreement',
  '🙌': 'Praise',
};

export interface ReactionState {
  count: number;
  mine: boolean;
}

export interface ReactionsProps {
  reactions: Record<string, ReactionState>;
  onToggle: (emoji: Emoji) => void;
  ariaLabel: string;
}

export function Reactions({ reactions, onToggle, ariaLabel }: ReactionsProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pickerSide, setPickerSide] = useState<'right' | 'left'>('right');
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setPickerSide('right');
      return;
    }
    const onOutside = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEsc);
    // After the picker renders at right-0, check if it overflowed the left edge
    // and flip to left-0 if so. One rAF is enough — no visible flicker in practice.
    const frame = requestAnimationFrame(() => {
      if (!pickerRef.current) return;
      const { left } = pickerRef.current.getBoundingClientRect();
      if (left < 0) setPickerSide('left');
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const nonZero = EMOJI_SET.filter((e) => (reactions[e]?.count ?? 0) > 0);
  // Once every emoji in the set has at least one reaction, the picker has
  // nothing left to add — hide it so the strip doesn't waste space (and on
  // mobile, doesn't push past the screen edge).
  const showPicker = nonZero.length < EMOJI_SET.length;

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-label={ariaLabel}
      // min-h matches the picker trigger (h-11 mobile / h-7 desktop) so the
      // row keeps its height when the picker hides at 6/6 — otherwise the
      // post body would jitter up by a few pixels when that transition fires.
      className="relative inline-flex min-h-11 items-center gap-1.5 flex-wrap sm:min-h-7"
    >
      {nonZero.map((e) => {
        const r = reactions[e]!;
        const mineClass = r.mine
          ? 'bg-vesper-50 border-vesper-300 text-vesper-700'
          : 'bg-white border-[var(--border-soft)] text-[var(--fg-2)] hover:bg-parchment-100';
        return (
          <button
            key={e}
            type="button"
            aria-label={r.mine ? `Remove reaction: ${SENTIMENTS[e]}` : SENTIMENTS[e]}
            onClick={() => onToggle(e)}
            className={[
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px]',
              'transition-colors duration-200',
              mineClass,
            ].join(' ')}
          >
            <span>{e}</span>
            <span className="text-xs font-medium">{r.count}</span>
          </button>
        );
      })}
      {showPicker ? (
        <button
          ref={triggerRef}
          type="button"
          aria-label="Add reaction"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => {
            if (!open && triggerRef.current) {
              const { left, width } = triggerRef.current.getBoundingClientRect();
              setPickerSide(left + width / 2 > window.innerWidth / 2 ? 'right' : 'left');
            }
            setOpen((v) => !v);
          }}
          className={[
            'inline-flex items-center justify-center rounded-full border border-[var(--border-soft)]',
            'bg-white hover:bg-parchment-100 text-[var(--fg-3)] h-11 w-11 sm:h-7 sm:w-8 transition-colors',
            'focus:outline-none focus-visible:shadow-[var(--focus-ring)]',
          ].join(' ')}
        >
          <Icon name="smile-plus" size={14} />
        </button>
      ) : null}
      {open ? (
        <div
          ref={pickerRef}
          role="dialog"
          aria-label={`${ariaLabel} picker`}
          className={[
            `absolute z-20 -top-12 ${pickerSide === 'left' ? 'left-0' : 'right-0'}`,
            'flex items-center gap-1 rounded-full bg-white border border-[var(--border-soft)] shadow-warm-md px-2 py-1',
            'motion-safe:animate-fade-in',
          ].join(' ')}
        >
          {EMOJI_SET.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={SENTIMENTS[e]}
              onClick={() => {
                onToggle(e);
                setOpen(false);
              }}
              className="text-lg leading-none rounded-full h-8 w-8 inline-flex items-center justify-center hover:bg-parchment-100 focus:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              {e}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
