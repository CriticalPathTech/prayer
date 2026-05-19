import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { CommentForm } from '../components/CommentForm';
import { CommentThread } from '../components/CommentThread';
import { FlagCountPill } from '../components/FlagCountPill';
import { HiddenBanner } from '../components/HiddenBanner';
import { HideTombstone } from '../components/HideTombstone';
import { PinDialog } from '../components/PinDialog';
import { PostMenu } from '../components/PostMenu';
import { PrayButton } from '../components/PrayButton';
import { UpdatePostItem } from '../components/UpdatePostItem';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { Pill } from '../components/ui/Pill';
import { Reactions } from '../components/ui/Reactions';
import { useAuth } from '../hooks/useAuth';
import type { PostDetail } from '../hooks/usePost';
import { usePost } from '../hooks/usePost';
import { usePostComments } from '../hooks/usePostComments';
import { usePrayer } from '../hooks/usePrayer';
import { useReactions } from '../hooks/useReactions';
import { ApiError, apiFetch, pinPost, unpinPost } from '../lib/api';
import { isPrivilegedRole } from '../lib/roles';
import { formatAgo, expiringSoon } from '../lib/time';

export function PostDetailPage(): JSX.Element {
  const { id } = useParams();
  const { data, loading, notFound, error, reload } = usePost(id);

  if (notFound) {
    return (
      <div className="mx-auto max-w-detail">
        <p className="py-16 text-center font-serif text-[18px] text-[var(--fg-3)]">Not found</p>
      </div>
    );
  }
  if (loading || !data) {
    return (
      <div className="mx-auto max-w-detail">
        <p className="py-16 text-center text-sm text-[var(--fg-3)]">Loading…</p>
      </div>
    );
  }

  return <PostDetailView data={data} reload={reload} error={error} />;
}

interface PostDetailViewProps {
  data: PostDetail;
  reload: () => Promise<void>;
  error: string | null;
}

function PostDetailView({ data, reload, error }: PostDetailViewProps): JSX.Element {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);
  const [updateComposerOpen, setUpdateComposerOpen] = useState(false);
  const [updateBody, setUpdateBody] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);

  const { post, updates } = data;
  const postId = post.id;

  const {
    threads,
    loading: commentsLoading,
    error: commentsError,
    addComment,
    deleteComment,
  } = usePostComments(postId);

  const postReactions = useReactions({
    targetType: 'post',
    postId,
    targetId: postId,
    initial: data.reactions,
  });
  const prayer = usePrayer({
    postId,
    initial: { prayed: data.prayer.prayed, prayerCount: data.prayer.prayer_count },
  });

  const callerId = me?.id;
  const isAuthor = !!me && post.is_own_post;
  const canPublish = isAuthor && post.status === 'draft';
  const name = post.is_anonymous ? 'Anonymous' : (post.display_name ?? 'Anonymous');
  const isPrivileged = isPrivilegedRole(me?.role);
  const showHiddenBanner = post.status === 'hidden' && isAuthor;
  const showModeratorHiddenBanner = post.status === 'hidden' && isPrivileged && !isAuthor;
  const flagCount = post.flag_count ?? 0;
  const showFlagPill = isPrivileged && flagCount > 0;
  const answered = post.is_answered_prayer;
  const expiring = expiringSoon(post.expires_at);

  if (post.is_tombstone) {
    return (
      <div className="mx-auto max-w-detail">
        <article className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-5 shadow-warm-sm">
          <HideTombstone kind="post" />
        </article>
      </div>
    );
  }

  async function act(fn: () => Promise<unknown>, after?: 'reload' | 'home'): Promise<void> {
    setActionError(null);
    try {
      await fn();
      if (after === 'reload') await reload();
      if (after === 'home') navigate('/');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  const articleClass = [
    'rounded-md border bg-[var(--bg-raised)] p-6 shadow-warm-sm mb-6',
    answered ? 'border-[var(--answered-border)]' : 'border-[var(--border-soft)]',
  ].join(' ');

  return (
    <div className="mx-auto max-w-detail">
      <article className={articleClass}>
        <header className="mb-3 flex items-center gap-3">
          <Avatar name={name} avatarUrl={post.avatar_url} anonymous={post.is_anonymous} size="md" />
          <div className="min-w-0 flex-1">
            <div className="font-serif text-[15px] font-medium text-[var(--fg-1)]">{name}</div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--fg-3)]">
              <span>{formatAgo(post.created_at)}</span>
              {expiring ? (
                <>
                  <span aria-hidden>·</span>
                  <Pill kind="warm" leadingIcon="clock">
                    {expiring}
                  </Pill>
                </>
              ) : null}
            </div>
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
              navigate('/');
            }}
          />
        </header>
        {showHiddenBanner ? <HiddenBanner kind="post" /> : null}
        {showModeratorHiddenBanner ? (
          <HiddenBanner
            kind="post"
            moderatorView
            hiddenBy={post.hidden_by?.display_name ?? null}
            source={post.hidden_source ?? null}
          />
        ) : null}
        <p className="whitespace-pre-wrap font-serif text-[22px] leading-relaxed text-[var(--fg-2)] [text-wrap:pretty]">
          {post.body}
        </p>
        {answered ? (
          <div className="mt-4 -mx-6 px-6 py-2.5 border-t border-[var(--answered-border)] bg-gradient-to-r from-dawn-50 to-transparent flex items-center gap-2 text-[13px] font-semibold text-[var(--answered-fg)] tracking-[0.02em]">
            <Icon name="sunrise" size={16} />
            <span>Prayer answered</span>
          </div>
        ) : null}
        <footer className="mt-5 flex flex-wrap items-center gap-3">
          <PrayButton
            prayed={prayer.prayed}
            prayerCount={prayer.prayerCount}
            onToggle={() => void prayer.toggle().catch(() => {})}
          />
          <div className="flex-1" />
          <Reactions
            ariaLabel="reactions on this post"
            reactions={postReactions.reactions}
            onToggle={(e) => void postReactions.toggle(e).catch(() => {})}
          />
          {showFlagPill ? <FlagCountPill count={flagCount} targetId={post.id} /> : null}
        </footer>
      </article>

      {actionError ? <p className="mb-4 text-sm text-ember-600">{actionError}</p> : null}

      {canPublish && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              act(() => apiFetch(`/posts/${post.id}/publish`, { method: 'POST' }), 'reload')
            }
          >
            Publish
          </Button>
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-3 font-serif text-lg font-semibold text-[var(--fg-1)]">Updates</h2>
        {updates.length === 0 ? (
          <p className="mb-3 text-sm text-[var(--fg-3)]">No updates yet.</p>
        ) : null}
        {updates.map((u) => (
          <UpdatePostItem key={u.id} update={u} />
        ))}
        {isAuthor && post.status !== 'archived' ? (
          updateComposerOpen ? (
            <div className="mt-3 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4 shadow-warm-sm">
              <textarea
                aria-label="Update body"
                placeholder="Share an update…"
                rows={4}
                maxLength={10_000}
                value={updateBody}
                onChange={(e) => setUpdateBody(e.target.value)}
                className="w-full resize-none rounded-sm border border-[var(--border-soft)] bg-[var(--bg-base)] px-3 py-2 font-serif text-[16px] leading-relaxed text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:outline-none focus:ring-2 focus:ring-vesper-400"
              />
              <div className="mt-2">
                <label className="inline-flex items-center gap-2 text-sm text-[var(--fg-2)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAnswered}
                    onChange={(e) => setIsAnswered(e.target.checked)}
                    className="h-4 w-4 accent-vesper-500"
                  />
                  <span>This update reports an answered prayer</span>
                </label>
                <p className="mt-1 text-xs text-[var(--fg-3)]">
                  Marks the whole post as answered on the feed.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  leadingIcon="plus"
                  onClick={async () => {
                    await act(
                      () =>
                        apiFetch(`/posts/${post.id}/updates`, {
                          method: 'POST',
                          body: JSON.stringify({
                            body: updateBody,
                            is_answered_prayer: isAnswered,
                          }),
                        }),
                      'reload',
                    );
                    setUpdateBody('');
                    setIsAnswered(false);
                    setUpdateComposerOpen(false);
                  }}
                >
                  Publish update
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => {
                    setUpdateBody('');
                    setIsAnswered(false);
                    setUpdateComposerOpen(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              leadingIcon="plus"
              onClick={() => setUpdateComposerOpen(true)}
            >
              Add update
            </Button>
          )
        ) : null}
      </section>
      {error ? <p className="mb-4 text-sm text-ember-600">{error}</p> : null}

      <PinDialog
        open={pinDialogOpen}
        onCancel={() => setPinDialogOpen(false)}
        onConfirm={async (days) => {
          await pinPost(post.id, days as 1 | 3 | 7 | 14 | 30);
          setPinDialogOpen(false);
          await reload();
        }}
      />

      <section className="border-t border-[var(--border-soft)] pt-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-[var(--fg-1)]">Comments</h2>
          {isPrivileged ? <Pill kind="warm">Moderator view</Pill> : null}
        </div>
        {commentsError ? <p className="mb-3 text-sm text-ember-600">{commentsError}</p> : null}
        {commentsLoading ? (
          <p className="mb-3 text-sm text-[var(--fg-3)]">Loading comments…</p>
        ) : null}
        {threads.map((thread) => {
          const callerIsPrivileged = isPrivilegedRole(me?.role);
          const canReply =
            (isAuthor && post.status !== 'archived') ||
            thread.participant_id === callerId ||
            (callerIsPrivileged && post.status !== 'archived');
          return (
            <CommentThread
              key={thread.participant_id}
              thread={thread}
              postId={post.id}
              callerId={callerId ?? null}
              callerIsPrivileged={callerIsPrivileged}
              canReply={canReply}
              onReply={(body, participantId) =>
                addComment({
                  body,
                  ...(isAuthor || callerIsPrivileged ? { participant_id: participantId } : {}),
                })
              }
              onDelete={deleteComment}
            />
          );
        })}
        {!isAuthor &&
        !commentsLoading &&
        post.status !== 'archived' &&
        !threads.some((t) => t.participant_id === callerId) ? (
          <div className="mt-3">
            <p className="mb-2 text-sm text-[var(--fg-3)]">
              {threads.length === 0
                ? 'No comments yet. Start a private thread with the author.'
                : 'Start your own private thread with the author.'}
            </p>
            <CommentForm
              label="Your comment"
              submitLabel="Send"
              onSubmit={(body) => addComment({ body })}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
