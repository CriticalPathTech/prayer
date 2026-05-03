import type { JSX } from 'react';
import { useRef, useState } from 'react';

import { Icon } from '../../components/ui/Icon';
import { apiFetch } from '../../lib/api';

export interface MobileCommentComposerProps {
  postId: string;
  participantId: string;
  layout: 'inline' | 'pinned';
  authorDisplayName?: string;
  onSent?: () => void;
}

export function MobileCommentComposer({
  postId,
  participantId,
  layout,
  authorDisplayName,
  onSent,
}: MobileCommentComposerProps): JSX.Element {
  const [expanded, setExpanded] = useState(layout === 'pinned');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function send(): Promise<void> {
    if (body.trim().length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body, participant_id: participantId }),
      });
      setBody('');
      if (layout === 'inline') setExpanded(false);
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (layout === 'inline' && !expanded) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => {
            setExpanded(true);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] px-3 text-sm font-medium text-[var(--fg-2)] active:bg-parchment-100"
        >
          <Icon name="message" size={16} />
          Reply
        </button>
      </div>
    );
  }

  const containerClass =
    layout === 'pinned'
      ? 'fixed inset-x-0 bottom-0 z-10 border-t border-[var(--border-soft)] bg-[var(--bg-raised)] px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]'
      : 'mt-2 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-3';

  const placeholder =
    layout === 'pinned' && authorDisplayName
      ? `Reply to ${authorDisplayName}…`
      : 'Type your reply…';

  return (
    <div className={containerClass}>
      {error ? <p className="mb-1 text-xs text-ember-600">{error}</p> : null}
      <textarea
        ref={textareaRef}
        aria-label="Reply"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={layout === 'pinned' ? 2 : 3}
        className="w-full resize-none rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] p-2 text-sm leading-relaxed text-[var(--fg-2)] outline-none focus-visible:shadow-[var(--focus-ring)]"
      />
      <div className="mt-1 flex justify-end gap-2">
        {layout === 'inline' ? (
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              setBody('');
              setError(null);
            }}
            className="inline-flex h-8 items-center rounded-md px-3 text-sm text-[var(--fg-3)] active:bg-parchment-100"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          disabled={submitting || body.trim().length === 0}
          onClick={() => void send()}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-vesper-500 px-3 text-sm font-medium text-white shadow-warm-sm transition-colors disabled:opacity-50 active:bg-vesper-600"
        >
          {submitting ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
