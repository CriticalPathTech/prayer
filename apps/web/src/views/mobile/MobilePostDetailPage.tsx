import type { JSX } from 'react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { PinDialog } from '../../components/PinDialog';
import { PostMenu } from '../../components/PostMenu';
import { UpdatePostItem } from '../../components/UpdatePostItem';
import { Avatar } from '../../components/ui/Avatar';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../../hooks/useAuth';
import { usePost } from '../../hooks/usePost';
import { usePostComments } from '../../hooks/usePostComments';
import { apiFetch, pinPost, unpinPost } from '../../lib/api';
import { isPrivilegedRole } from '../../lib/roles';
import { formatAgo } from '../../lib/time';

import { MobileCommentComposer } from './MobileCommentComposer';
import { MobileCommentThread } from './MobileCommentThread';
import { MobilePageHeader } from './MobilePageHeader';

export function MobilePostDetailPage(): JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const { data, loading, notFound, error, reload } = usePost(id);
  const { threads, reload: reloadComments } = usePostComments(id);
  const { me } = useAuth();
  const [pinDialogOpen, setPinDialogOpen] = useState(false);

  if (notFound) {
    return (
      <>
        <MobilePageHeader variant={{ kind: 'back', title: 'Request' }} />
        <div className="px-4 py-16 text-center text-sm text-[var(--fg-3)]">Post not found.</div>
      </>
    );
  }
  if (loading || !data) {
    return (
      <>
        <MobilePageHeader variant={{ kind: 'back', title: 'Request' }} />
        <div className="px-4 py-16 text-center text-sm text-[var(--fg-3)]">Loading…</div>
      </>
    );
  }

  const post = data.post;
  const isAuthor = !!me && post.author_id === me.id && post.is_own_post;
  const isPrivileged = isPrivilegedRole(me?.role);
  const authorDisplayName = post.is_anonymous ? 'the author' : (post.display_name ?? 'the author');

  const myParticipantId = !isAuthor && me ? me.id : null;

  function handleDataChange(): void {
    void reload();
    void reloadComments();
  }

  return (
    <div className="pb-24">
      <MobilePageHeader variant={{ kind: 'back', title: 'Request' }} />
      <div className="flex flex-col gap-4 px-4 pb-6 pt-3">
        {error ? <p className="text-sm text-ember-600">{error}</p> : null}

        <article
          className={[
            'rounded-lg border bg-[var(--bg-raised)] p-4',
            post.pinned_at !== null
              ? 'border-vesper-300/50 bg-gradient-to-b from-vesper-50/60 to-[var(--bg-raised)] shadow-[inset_0_2px_0_theme(colors.vesper.200)]'
              : 'border-[var(--border-soft)]',
          ].join(' ')}
        >
          <header className="flex items-start gap-2.5">
            <Avatar
              name={post.is_anonymous ? 'Anonymous' : (post.display_name ?? 'Anonymous')}
              avatarUrl={post.avatar_url}
              anonymous={post.is_anonymous}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="font-serif text-[15px] font-semibold text-[var(--fg-1)]">
                {post.is_anonymous ? 'Anonymous' : (post.display_name ?? 'Anonymous')}
              </div>
              <div className="mt-0.5 text-xs text-[var(--fg-3)]">{formatAgo(post.created_at)}</div>
            </div>
            <PostMenu
              postId={post.id}
              isOwnPost={isAuthor}
              status={post.status}
              editDeadline={post.edit_deadline}
              isTombstone={!!post.is_tombstone}
              {...(me?.role !== undefined ? { viewerRole: me.role } : {})}
              isPinned={post.pinned_at !== null}
              onPin={() => setPinDialogOpen(true)}
              onUnpin={async () => {
                await unpinPost(post.id);
                await reload();
              }}
              onDelete={async () => {
                await apiFetch(`/posts/${post.id}`, { method: 'DELETE' });
              }}
            />
          </header>
          <p className="mt-3 whitespace-pre-wrap font-serif text-[16px] leading-[1.55] text-[var(--fg-2)] [text-wrap:pretty]">
            {post.body}
          </p>
        </article>

        {isAuthor ? <AddUpdateInline postId={post.id} onSaved={() => void reload()} /> : null}

        {data.updates.length > 0 ? (
          <div className="flex flex-col gap-2">
            {data.updates.map((u) => (
              <UpdatePostItem key={u.id} update={u} />
            ))}
          </div>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--fg-3)]">
            Conversations
          </h2>
          {threads.length === 0 ? (
            <p className="px-1 text-sm text-[var(--fg-3)]">No comments yet.</p>
          ) : null}
          {threads.map((t) => {
            const canPostHere = isAuthor || (!!me && t.participant_id === me.id);
            const canModerateHere = !isAuthor && isPrivileged && t.participant_id !== me?.id;
            return (
              <MobileCommentThread
                key={t.participant_id}
                postId={post.id}
                participantId={t.participant_id}
                comments={t.comments}
                viewerCanPostHere={canPostHere}
                viewerCanModerate={canModerateHere}
                onChange={handleDataChange}
              />
            );
          })}
        </section>
      </div>

      {!isAuthor && myParticipantId ? (
        <MobileCommentComposer
          postId={post.id}
          participantId={myParticipantId}
          layout="pinned"
          authorDisplayName={authorDisplayName}
          onSent={handleDataChange}
        />
      ) : null}

      <PinDialog
        open={pinDialogOpen}
        onCancel={() => setPinDialogOpen(false)}
        onConfirm={async (days) => {
          await pinPost(post.id, days as 1 | 3 | 7 | 14 | 30);
          setPinDialogOpen(false);
          await reload();
        }}
      />
    </div>
  );
}

interface AddUpdateInlineProps {
  postId: string;
  onSaved: () => void;
}

function AddUpdateInline({ postId, onSaved }: AddUpdateInlineProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [answered, setAnswered] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(): Promise<void> {
    if (body.trim().length === 0 || saving) return;
    setSaving(true);
    setErr(null);
    try {
      await apiFetch(`/posts/${postId}/updates`, {
        method: 'POST',
        body: JSON.stringify({ body, is_answered_prayer: answered }),
      });
      setBody('');
      setAnswered(false);
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 self-start rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] px-3 text-sm font-medium text-[var(--fg-2)] active:bg-parchment-100"
      >
        <Icon name="plus" size={16} />
        Add update
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-raised)] p-3">
      {err ? <p className="mb-1 text-xs text-ember-600">{err}</p> : null}
      <textarea
        aria-label="Update body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share an update…"
        rows={3}
        className="w-full resize-none rounded-md border border-[var(--border-soft)] bg-[var(--bg-page)] p-2 text-sm leading-relaxed text-[var(--fg-2)] outline-none focus-visible:shadow-[var(--focus-ring)]"
      />
      <label className="mt-2 flex items-center gap-2 text-sm text-[var(--fg-2)]">
        <input type="checkbox" checked={answered} onChange={(e) => setAnswered(e.target.checked)} />
        Mark as answered prayer
      </label>
      <div className="mt-1 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setBody('');
            setAnswered(false);
            setErr(null);
          }}
          className="inline-flex h-8 items-center rounded-md px-3 text-sm text-[var(--fg-3)] active:bg-parchment-100"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving || body.trim().length === 0}
          onClick={() => void send()}
          className="inline-flex h-8 items-center rounded-md bg-vesper-500 px-3 text-sm font-medium text-white shadow-warm-sm transition-colors disabled:opacity-50 active:bg-vesper-600"
        >
          {saving ? 'Saving…' : 'Save update'}
        </button>
      </div>
    </div>
  );
}
