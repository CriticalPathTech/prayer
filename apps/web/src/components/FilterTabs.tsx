import type { JSX } from 'react';

import type { FeedFilter } from '../hooks/useFeed';

const TABS: Array<{ key: FeedFilter; label: string }> = [
  { key: 'all', label: 'All requests' },
  { key: 'mine', label: 'My requests' },
  { key: 'answered', label: 'Answered' },
];

export interface FilterTabsProps {
  value: FeedFilter;
  onChange: (f: FeedFilter) => void;
}

export function FilterTabs({ value, onChange }: FilterTabsProps): JSX.Element {
  return (
    <div role="tablist" className="mb-4 flex gap-0.5 border-b border-[var(--border-soft)]">
      {TABS.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={[
              'relative px-3.5 py-2.5 text-sm transition-colors',
              active
                ? 'font-semibold text-[var(--fg-1)] after:absolute after:left-3.5 after:right-3.5 after:bottom-[-1px] after:h-0.5 after:rounded after:bg-[var(--accent)]'
                : 'font-medium text-[var(--fg-3)] hover:text-[var(--fg-2)]',
            ].join(' ')}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
