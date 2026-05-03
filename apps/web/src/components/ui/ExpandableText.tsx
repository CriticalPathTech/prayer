import type { JSX } from 'react';
import { useState } from 'react';

export interface ExpandableTextProps {
  text: string;
  /** Character count above which the text is trimmed and a "Show more" button
   * appears. */
  threshold: number;
  /** Tailwind classes for the rendered text node. */
  textClassName?: string;
  /** Tailwind classes for the wrapper that holds the text and the button. */
  containerClassName?: string;
}

export function ExpandableText({
  text,
  threshold,
  textClassName,
  containerClassName,
}: ExpandableTextProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const tooLong = text.length > threshold;
  const display = !tooLong || expanded ? text : text.slice(0, threshold).trimEnd() + '…';

  return (
    <div className={containerClassName}>
      <p className={textClassName}>{display}</p>
      {tooLong && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1.5 inline-flex items-center text-[13px] font-medium text-vesper-600 hover:underline focus:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          Show more
        </button>
      ) : null}
    </div>
  );
}
