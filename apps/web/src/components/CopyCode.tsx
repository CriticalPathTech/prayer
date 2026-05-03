import type { JSX } from 'react';
import { useState } from 'react';

import { Icon } from './ui/Icon';

export interface CopyCodeProps {
  code: string;
  label?: string;
  muted?: boolean;
}

export function CopyCode({
  code,
  label = 'invite code',
  muted = false,
}: CopyCodeProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  async function onCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access blocked by browser — surface nothing; user can still copy manually.
    }
  }

  const codeClass = muted
    ? 'font-mono text-lg text-[var(--fg-3)] tracking-widest line-through'
    : 'font-mono text-lg text-[var(--fg-1)] tracking-widest';

  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={codeClass}>{code}</span>
      <button
        type="button"
        onClick={() => void onCopy()}
        aria-label={`Copy ${label}`}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-2 py-0.5 text-xs text-[var(--fg-3)] transition-colors hover:text-[var(--fg-1)] hover:border-[var(--border-default)] focus:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        {copied ? (
          <>
            <Icon name="check" size={14} />
            <span>Copied</span>
          </>
        ) : (
          <span>Copy</span>
        )}
      </button>
    </span>
  );
}
