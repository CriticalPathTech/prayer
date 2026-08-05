import type { JSX } from 'react';
import { useRef, useState } from 'react';

import type { ApprovalItem } from '../lib/api';
import { formatAgo } from '../lib/time';

import { PostImages } from './PostImages';
import { Avatar } from './ui/Avatar';

const REJECT_PRESETS = [
  'Not really a prayer request',
  'Off-topic or commercial',
  'Could be hurtful to others',
  'Duplicate of another request',
];

const NOTE_MAX = 500;

export interface PendingCardProps {
  item: ApprovalItem;
  onApprove: (id: string) => void;
  onReject: (id: string, note: string) => void;
  onSkip: (id: string) => void;
  /** Disable all buttons while a server call is in flight */
  busy?: boolean;
  /** Inline error shown below actions */
  error?: string | null;
}

export function PendingCard({
  item,
  onApprove,
  onReject,
  onSkip,
  busy = false,
  error = null,
}: PendingCardProps): JSX.Element {
  const [flipped, setFlipped] = useState(false);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Mirror PostCard's author semantics so a post reads identically before and
  // after approval: anonymity and former-member status are explicit fields, not
  // inferred from a null display_name (which is true for both cases).
  const displayName = item.is_anonymous
    ? 'Anonymous'
    : item.is_former_member
      ? 'Former member'
      : (item.display_name ?? 'Anonymous');
  const isOrphanAuthor = item.is_anonymous || item.is_former_member;

  function handleReject(): void {
    onReject(item.id, note);
  }

  function cancelDecline(): void {
    setFlipped(false);
    setNote('');
    setPicked(null);
  }

  function selectPreset(r: string): void {
    setPicked(r);
    setNote(r);
    taRef.current?.focus();
  }

  if (flipped) {
    return (
      <article className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4 shadow-warm-sm space-y-3">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ember-600">Declining</p>
          <p className="text-sm font-medium text-[var(--fg-1)]">
            Tell <strong>{isOrphanAuthor ? 'the author' : displayName}</strong> why
          </p>
          <p className="text-xs text-[var(--fg-3)]">
            They&apos;ll get a private note from <em>Moderator</em>. No other member sees this
            request.
          </p>
        </header>

        <div className="flex flex-wrap gap-1.5">
          {REJECT_PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => selectPreset(r)}
              className={[
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                picked === r
                  ? 'border-[var(--fg-1)] bg-[var(--fg-1)] text-[var(--bg-page)]'
                  : 'border-[var(--border-soft)] bg-[var(--bg-page)] text-[var(--fg-2)] hover:border-[var(--fg-3)]',
              ].join(' ')}
            >
              {r}
            </button>
          ))}
        </div>

        <textarea
          ref={taRef}
          className="w-full rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] p-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-4)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
          placeholder="A short, kind note — or pick a reason above."
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setPicked(null);
          }}
          rows={4}
          maxLength={NOTE_MAX}
        />
        <p className="text-right text-xs text-[var(--fg-3)]">
          {note.length} / {NOTE_MAX}
        </p>

        {error ? <p className="text-xs text-ember-600">{error}</p> : null}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={cancelDecline}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 text-sm font-medium text-[var(--fg-2)] hover:bg-parchment-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleReject}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-md bg-ember-600 px-4 text-sm font-medium text-white hover:bg-ember-700 disabled:opacity-50"
          >
            Send &amp; decline
          </button>
        </div>
      </article>
    );
  }

  // Front face
  return (
    <article className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4 shadow-warm-sm space-y-3">
      <header className="flex items-start gap-3">
        <div className="shrink-0">
          <Avatar
            name={displayName}
            avatarUrl={item.avatar_url}
            anonymous={isOrphanAuthor}
            size="md"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--fg-1)]">{displayName}</p>
          <p className="text-xs text-[var(--fg-3)]">Submitted {formatAgo(item.created_at)}</p>
        </div>
        {item.skipped_by_me ? (
          <span className="rounded-full bg-parchment-100 px-2 py-0.5 text-xs text-[var(--fg-3)]">
            Skipped
          </span>
        ) : null}
      </header>

      <p className="text-sm text-[var(--fg-1)] leading-relaxed whitespace-pre-wrap">{item.body}</p>

      <PostImages images={item.images} variant="detail" />

      {error ? <p className="text-xs text-ember-600">{error}</p> : null}

      <footer className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSkip(item.id)}
          disabled={busy}
          className="inline-flex h-9 items-center rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] px-3 text-sm font-medium text-[var(--fg-3)] hover:text-[var(--fg-2)] disabled:opacity-50"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => setFlipped(true)}
          disabled={busy}
          className="inline-flex h-9 items-center rounded-md border border-ember-300 bg-[var(--bg-page)] px-3 text-sm font-medium text-ember-700 hover:bg-ember-50 disabled:opacity-50"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => onApprove(item.id)}
          disabled={busy}
          className="inline-flex h-9 items-center rounded-md bg-vesper-600 px-4 text-sm font-medium text-white hover:bg-vesper-700 disabled:opacity-50"
        >
          Approve
        </button>
      </footer>
    </article>
  );
}
