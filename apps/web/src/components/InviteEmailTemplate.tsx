import type { JSX } from 'react';
import { useState } from 'react';

import { useAuth } from '../hooks/useAuth';
import { buildInviteEmail } from '../lib/inviteEmail';
import { churchName } from '../lib/org';

import { Icon } from './ui/Icon';

export interface InviteEmailTemplateProps {
  code: string;
  seatsRemaining: number;
}

function CopyButton({ text, label }: { text: string; label: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  async function onCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked by the browser — the text is on screen and selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-2 py-0.5 text-xs text-[var(--fg-3)] transition-colors hover:border-[var(--border-default)] hover:text-[var(--fg-1)] focus:outline-none focus-visible:shadow-[var(--focus-ring)]"
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
  );
}

/**
 * Ready-to-send invitation text under an invite code. Rendered only while the
 * code still has a seat — a full or retired code has no one left to invite.
 */
export function InviteEmailTemplate({
  code,
  seatsRemaining,
}: InviteEmailTemplateProps): JSX.Element | null {
  const { me } = useAuth();

  if (seatsRemaining <= 0) return null;

  const { body } = buildInviteEmail({
    church: churchName(me?.orgDisplayName),
    code,
    signupUrl: `${window.location.origin}/signup`,
    seatsRemaining,
  });

  return (
    <details className="mt-3 border-t border-[var(--border-soft)] pt-3">
      <summary className="cursor-pointer text-sm text-[var(--fg-2)] marker:text-[var(--fg-3)] hover:text-[var(--fg-1)]">
        Email template
      </summary>
      <div className="mt-3">
        <p className="whitespace-pre-wrap rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] p-3 text-sm leading-relaxed text-[var(--fg-1)]">
          {body}
        </p>
        <div className="mt-2 flex justify-end">
          <CopyButton text={body} label="Copy email body" />
        </div>
      </div>
    </details>
  );
}
