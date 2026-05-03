import type { JSX } from 'react';

import { Icon } from './ui/Icon';

export interface PrayButtonProps {
  prayed: boolean;
  prayerCount: number;
  onToggle: () => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export function PrayButton({
  prayed,
  prayerCount,
  onToggle,
  size = 'md',
  disabled,
}: PrayButtonProps): JSX.Element {
  const heightClass = size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-sm';
  const iconSize = 18;

  const base = [
    'inline-flex items-center gap-2 rounded-md font-semibold whitespace-nowrap',
    'transition-colors duration-200',
    'focus:outline-none focus-visible:shadow-[var(--focus-ring)]',
    'disabled:opacity-50 disabled:cursor-default',
    heightClass,
  ];
  const stateClasses = prayed
    ? ['bg-parchment-100 text-[var(--fg-2)] border border-[var(--border-default)]']
    : ['bg-vesper-500 text-[var(--fg-on-accent)] hover:bg-vesper-600 border border-transparent'];

  return (
    <span className="inline-flex items-center gap-2.5">
      <button
        type="button"
        aria-pressed={prayed}
        disabled={disabled || prayed}
        onClick={onToggle}
        className={[...base, ...stateClasses].join(' ')}
      >
        {prayed ? (
          <span className="inline-flex motion-safe:animate-check-bloom">
            <Icon name="check" size={iconSize} />
          </span>
        ) : (
          <Icon name="pray" size={iconSize} />
        )}
        <span>{prayed ? 'Prayed' : 'I Will Pray'}</span>
      </button>
      {prayerCount > 0 ? (
        <span className="text-[13px] text-[var(--fg-3)] font-medium whitespace-nowrap">
          <span aria-live="polite" className="text-vesper-600 font-semibold">
            {prayerCount}
          </span>{' '}
          praying
        </span>
      ) : null}
    </span>
  );
}
