import type { JSX } from 'react';

import { Icon } from './ui/Icon';

export interface PinnedByRibbonProps {
  /** When provided, renders "Pinned by <name>". When null/undefined, renders just "Pinned". */
  pinnedBy: { id: string; display_name: string } | null;
  /** Optional className for layout overrides (e.g., to break out of a card's padding). */
  className?: string;
}

/**
 * "PINNED BY <Name>" ribbon shown at the top of pinned posts. Matches the
 * design reference at tmp/Mobile/PostComponents.jsx — vesper palette,
 * uppercase tracking, pin icon rotated 35°.
 */
export function PinnedByRibbon({ pinnedBy, className }: PinnedByRibbonProps): JSX.Element {
  return (
    <div
      className={[
        'inline-flex items-center gap-[5px] self-start',
        'text-[10px] font-bold uppercase tracking-[0.14em] text-vesper-600',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon name="pin" size={14} className="flex-none text-vesper-500 rotate-[35deg]" />
      <span>
        Pinned
        {pinnedBy ? (
          <>
            {' '}
            by{' '}
            <b className="ml-[2px] text-[11px] font-bold normal-case tracking-[0.02em] text-vesper-700">
              {pinnedBy.display_name}
            </b>
          </>
        ) : null}
      </span>
    </div>
  );
}
