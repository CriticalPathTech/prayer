import type { JSX } from 'react';

import { useAuth } from '../hooks/useAuth';
import type { Comment } from '../hooks/usePostComments';
import { useReactions } from '../hooks/useReactions';
import { formatAgo } from '../lib/time';

import { FlagButton } from './FlagButton';
import { FlagCountPill } from './FlagCountPill';
import { HiddenBanner } from './HiddenBanner';
import { HideTombstone } from './HideTombstone';
import { Avatar } from './ui/Avatar';
import { Reactions } from './ui/Reactions';

export interface CommentItemProps {
  comment: Comment;
  postId: string;
  callerId: string | null;
  callerIsPrivileged: boolean;
  onDelete?: (commentId: string) => void;
}

export function CommentItem({
  comment,
  postId,
  callerId,
  callerIsPrivileged,
  onDelete,
}: CommentItemProps): JSX.Element {
  const { me } = useAuth();
  const { reactions, toggle } = useReactions({
    targetType: 'comment',
    postId,
    targetId: comment.id,
    initial: comment.reactions,
  });

  if (comment.is_tombstone) {
    return (
      <article className="mb-3 rounded-md border border-[var(--border-soft)] bg-parchment-100 p-4">
        <HideTombstone kind="comment" />
      </article>
    );
  }

  const displayName = comment.is_anonymous_author
    ? 'Anonymous (author)'
    : (comment.display_name ?? 'Unknown');
  const isOwnComment = !!callerId && comment.author_id === callerId;
  const canRemove = isOwnComment || callerIsPrivileged;
  const removeLabel = isOwnComment ? 'Delete' : 'Hide';
  const showHiddenBanner = comment.is_hidden && isOwnComment;
  const flagCount = comment.flag_count ?? 0;
  const showFlagPill = callerIsPrivileged && flagCount > 0;
  const showFlagButton = !!me && comment.author_id !== null && me.id !== comment.author_id;

  const wrapperClass = [
    'mb-3 rounded-md border border-[var(--border-soft)] bg-parchment-100 p-4',
    isOwnComment ? 'ring-1 ring-vesper-200' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={wrapperClass}>
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar
            name={displayName}
            avatarUrl={comment.avatar_url}
            anonymous={comment.is_anonymous_author}
            size="sm"
          />
          <span className="font-serif text-sm font-medium text-[var(--fg-1)]">{displayName}</span>
          <span className="text-xs text-[var(--fg-3)]">· {formatAgo(comment.created_at)}</span>
        </div>
        {canRemove && onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(comment.id)}
            className="text-xs font-medium text-ember-600 hover:underline"
          >
            {removeLabel}
          </button>
        ) : null}
      </header>
      {showHiddenBanner ? <HiddenBanner kind="comment" /> : null}
      <p className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-[var(--fg-2)] [text-wrap:pretty]">
        {comment.body}
      </p>
      <footer className="mt-3 flex flex-wrap items-center gap-3">
        <Reactions
          ariaLabel="reactions on this comment"
          reactions={reactions}
          onToggle={(e) => void toggle(e).catch(() => {})}
        />
        {showFlagPill ? <FlagCountPill count={flagCount} targetId={comment.id} /> : null}
        {showFlagButton ? (
          <FlagButton targetType="comment" postId={postId} targetId={comment.id} />
        ) : null}
      </footer>
    </article>
  );
}
