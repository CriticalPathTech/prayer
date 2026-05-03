import type { JSX } from 'react';
import { useState } from 'react';

import type { Thread } from '../hooks/usePostComments';

import { CommentForm } from './CommentForm';
import { CommentItem } from './CommentItem';
import { Button } from './ui/Button';

export interface CommentThreadProps {
  thread: Thread;
  postId: string;
  callerId: string | null;
  callerIsPrivileged: boolean;
  canReply: boolean;
  onReply: (body: string, participantId: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}

export function CommentThread({
  thread,
  postId,
  callerId,
  callerIsPrivileged,
  canReply,
  onReply,
  onDelete,
}: CommentThreadProps): JSX.Element {
  const [composerOpen, setComposerOpen] = useState(false);
  return (
    <section className="mb-4 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4 shadow-warm-sm">
      <header className="mb-3 text-xs font-medium uppercase tracking-[0.04em] text-[var(--fg-3)]">
        Thread with {thread.participant_display_name ?? 'unknown'}
      </header>
      <div>
        {thread.comments.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            postId={postId}
            callerId={callerId}
            callerIsPrivileged={callerIsPrivileged}
            onDelete={async (id) => {
              await onDelete(id);
            }}
          />
        ))}
      </div>
      {canReply ? (
        composerOpen ? (
          <CommentForm
            label="Reply"
            submitLabel="Reply"
            onSubmit={async (body) => {
              await onReply(body, thread.participant_id);
              setComposerOpen(false);
            }}
          />
        ) : (
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              leadingIcon="message"
              onClick={() => setComposerOpen(true)}
            >
              Comment
            </Button>
          </div>
        )
      ) : null}
    </section>
  );
}
