import type { JSX } from 'react';

export const DEFAULT_PIN_DAYS = 7;
export const PIN_CHOICES = [1, 3, 7, 14, 30] as const;

const CHOICES: Array<{ days: number; label: string }> = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
];

export interface PinDurationPickerProps {
  value: number;
  onChange: (days: number) => void;
}

export function PinDurationPicker({ value, onChange }: PinDurationPickerProps): JSX.Element {
  return (
    <div role="radiogroup" aria-label="Pin for" className="flex flex-wrap gap-2">
      {CHOICES.map((c) => {
        const active = value === c.days;
        return (
          <button
            key={c.days}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(c.days)}
            className={[
              'rounded-full border px-3 py-1 text-[13px] font-medium transition-colors',
              'focus:outline-none focus-visible:shadow-[var(--focus-ring)]',
              active
                ? 'bg-vesper-50 border-vesper-300 text-vesper-700'
                : 'bg-white border-[var(--border-soft)] text-[var(--fg-3)] hover:bg-parchment-100',
            ].join(' ')}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
