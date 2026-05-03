import type { JSX } from 'react';

import type { FeedPost } from '../hooks/useFeed';
import { formatAgo } from '../lib/time';

import { Icon } from './ui/Icon';

export interface UpdatePostItemProps {
  update: FeedPost;
  /** When true, render a compact form for inline embedding: no author name
   * (caller already shows the parent's author). The eyebrow label ("ANSWERED"
   * / "UPDATE") is kept since it's the only textual marker in compact mode.
   * Defaults to false. */
  embedded?: boolean;
}

export function UpdatePostItem({ update, embedded = false }: UpdatePostItemProps): JSX.Element {
  const answered = update.is_answered_prayer;
  const name = update.is_anonymous ? 'Anonymous' : (update.display_name ?? 'Anonymous');

  const wrapperClass = answered
    ? 'mb-3 rounded-md border border-[var(--answered-border)] bg-gradient-to-b from-dawn-50 to-white p-4'
    : 'mb-3 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4';

  const eyebrowClass = answered
    ? 'mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--answered-fg)]'
    : 'mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--fg-3)]';

  return (
    <article className={wrapperClass}>
      <div className={eyebrowClass}>
        {answered ? <Icon name="sunrise" size={14} /> : null}
        <span>{answered ? 'Answered' : 'Update'}</span>
        <span aria-hidden>·</span>
        <span className="font-normal normal-case tracking-normal">
          {formatAgo(update.created_at)}
        </span>
      </div>
      {embedded ? null : (
        <div className="mb-1.5 font-serif text-sm font-medium text-[var(--fg-1)]">{name}</div>
      )}
      <p className="whitespace-pre-wrap font-serif text-[16px] leading-relaxed text-[var(--fg-2)] [text-wrap:pretty]">
        {update.body}
      </p>
    </article>
  );
}
