import type { JSX } from 'react';
import { useState } from 'react';

import { Avatar } from '../../components/ui/Avatar';
import { Icon } from '../../components/ui/Icon';
import { apiFetch } from '../../lib/api';
import { formatAgo } from '../../lib/time';

import { MobileCommentComposer } from './MobileCommentComposer';

interface CommentRow {
  id: string;
  post_id: string;
  author_id: string | null;
  participant_id: string;
  display_name: string | null;
  avatar_url: string | null;
  body: string;
  is_hidden: boolean;
  created_at: string;
  is_former_member?: boolean;
}

export interface MobileCommentThreadProps {
  postId: string;
  participantId: string;
  comments: CommentRow[];
  viewerCanPostHere: boolean;
  viewerCanModerate: boolean;
  onChange?: () => void;
}

export function MobileCommentThread({
  postId,
  participantId,
  comments,
  viewerCanPostHere,
  viewerCanModerate,
  onChange,
}: MobileCommentThreadProps): JSX.Element {
  return (
    <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-raised)] p-3">
      {comments.map((c) => (
        <CommentRowView
          key={c.id}
          comment={c}
          canModerate={viewerCanModerate}
          {...(onChange !== undefined ? { onChange } : {})}
        />
      ))}
      {viewerCanPostHere ? (
        <MobileCommentComposer
          postId={postId}
          participantId={participantId}
          layout="inline"
          {...(onChange !== undefined ? { onSent: onChange } : {})}
        />
      ) : null}
    </section>
  );
}

interface CommentRowViewProps {
  comment: CommentRow;
  canModerate: boolean;
  onChange?: () => void;
}

function CommentRowView({ comment, canModerate, onChange }: CommentRowViewProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const name = comment.is_former_member ? 'Former member' : (comment.display_name ?? 'Anonymous');

  async function hide(): Promise<void> {
    await apiFetch(`/posts/${comment.post_id}/comments/${comment.id}`, { method: 'DELETE' });
    setMenuOpen(false);
    onChange?.();
  }

  return (
    <div className="flex items-start gap-2 py-2">
      <Avatar name={name} avatarUrl={comment.avatar_url} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-[var(--fg-3)]">
          <span className="font-semibold text-[var(--fg-1)]">{name}</span>
          <span>·</span>
          <span>{formatAgo(comment.created_at)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--fg-2)]">{comment.body}</p>
      </div>
      {canModerate ? (
        <div className="relative">
          <button
            type="button"
            aria-label="Comment menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--fg-3)] active:bg-parchment-100"
          >
            <Icon name="more" size={16} />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+4px)] z-10 min-w-[160px] overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] text-sm shadow-warm-md"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => void hide()}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-ember-600 hover:bg-parchment-100"
              >
                <Icon name="x" size={14} /> Hide
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
