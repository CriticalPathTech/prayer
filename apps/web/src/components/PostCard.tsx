import type { JSX } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import type { FeedPost } from '../hooks/useFeed';
import { usePrayer } from '../hooks/usePrayer';
import { useReactions } from '../hooks/useReactions';
import { apiFetch, extendPost } from '../lib/api';
import { isCardBodyClick } from '../lib/cardClick';
import { isPrivilegedRole } from '../lib/roles';
import { expiringSoon, formatAgo } from '../lib/time';

import { ExtendDialog } from './ExtendDialog';
import { FlagCountPill } from './FlagCountPill';
import { HiddenBanner } from './HiddenBanner';
import { HideTombstone } from './HideTombstone';
import { PostImages } from './PostImages';
import { PostMenu } from './PostMenu';
import { PrayButton } from './PrayButton';
import { UpdatePostItem } from './UpdatePostItem';
import { Avatar } from './ui/Avatar';
import { ExpandableText } from './ui/ExpandableText';
import { Icon } from './ui/Icon';
import { Pill } from './ui/Pill';
import { Reactions } from './ui/Reactions';

export interface PostCardProps {
  post: FeedPost;
  /** Called after a successful post mutation (delete). Optional — pages that
   * don't re-render the list on mutation may omit it. */
  onChange?: () => void;
  /** Called when the user clicks "Repost" on an archived own post. */
  onRepost?: () => void | Promise<void>;
}

export function PostCard({ post, onChange, onRepost }: PostCardProps): JSX.Element {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [extendOpen, setExtendOpen] = useState(false);
  const prayer = usePrayer({
    postId: post.id,
    initial: { prayed: post.prayed, prayerCount: post.prayer_count },
  });
  const reactions = useReactions({
    targetType: 'post',
    postId: post.id,
    targetId: post.id,
    initial: post.reactions ?? {},
  });

  async function handleDelete(): Promise<void> {
    await apiFetch(`/posts/${post.id}`, { method: 'DELETE' });
    onChange?.();
  }

  if (post.is_tombstone) {
    return (
      <article className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] p-5 shadow-warm-sm">
        <HideTombstone kind="post" />
      </article>
    );
  }

  if (post.status === 'pending') {
    const pendingName = post.is_anonymous
      ? 'Anonymous'
      : post.is_former_member
        ? 'Former member'
        : (post.display_name ?? 'Anonymous');
    const pendingIsOrphan = post.is_anonymous || post.is_former_member;
    return (
      <article className="rounded-md border border-[var(--border-soft)] bg-parchment-100 p-5 shadow-warm-sm mb-4 opacity-75">
        <header className="mb-2.5 flex items-center gap-3">
          <Avatar
            name={pendingName}
            avatarUrl={post.avatar_url}
            anonymous={pendingIsOrphan}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="font-serif text-[15px] font-medium text-[var(--fg-2)]">
              {pendingName}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--fg-3)]">
              <span>{formatAgo(post.created_at)}</span>
              <span aria-hidden>·</span>
              <Pill kind="default" leadingIcon="clock">
                Pending review
              </Pill>
            </div>
          </div>
          <PostMenu
            postId={post.id}
            isOwnPost={!!me && post.is_own_post}
            status={post.status}
            editDeadline={post.edit_deadline}
            isTombstone={false}
            onDelete={handleDelete}
          />
        </header>
        <ExpandableText
          text={post.body}
          threshold={600}
          textClassName="m-0 font-serif text-[18px] leading-relaxed text-[var(--fg-3)] whitespace-pre-wrap [text-wrap:pretty]"
        />
      </article>
    );
  }

  // Anonymity mask wins over former-member treatment for display.
  const name = post.is_anonymous
    ? 'Anonymous'
    : post.is_former_member
      ? 'Former member'
      : (post.display_name ?? 'Anonymous');
  const isOrphanAuthor = post.is_anonymous || post.is_former_member;
  const expiring = expiringSoon(post.expires_at);
  const answered = post.is_answered_prayer;
  const isPrivileged = isPrivilegedRole(me?.role);
  const isAuthor = !!me && post.is_own_post;
  const showHiddenBanner = post.status === 'hidden' && isAuthor;
  const showModeratorHiddenBanner = post.status === 'hidden' && isPrivileged && !isAuthor;
  const flagCount = post.flag_count ?? 0;
  const showFlagPill = isPrivileged && flagCount > 0;
  // /feed always populates `updates`; /posts/me/archive returns the raw
  // PostDto without it. Default to empty so PostCard renders cleanly in
  // both places.
  const updates = post.updates ?? [];
  const MAX_INLINE = 3;
  const inlineUpdates = updates.slice(-MAX_INLINE);
  const olderCount = Math.max(0, updates.length - MAX_INLINE);
  // The whole card reads as "answered" when the parent itself is flagged
  // OR any of its updates is. The gold border carries that signal; per-update
  // gold wrappers are suppressed (`suppressAnsweredWrapper` below) so the
  // treatment doesn't double up.
  const hasAnsweredUpdate = updates.some((u) => u.is_answered_prayer);
  const cardIsAnswered = answered || hasAnsweredUpdate;
  // Ribbon shows when the parent is flagged answered AND none of the inline
  // updates carries the answered flag — preserves the answered moment when
  // it's older than the 3 most-recent slice.
  const showRibbon = answered && inlineUpdates.every((u) => !u.is_answered_prayer);

  const isPinned = post.pinned_at !== null;

  const cardClass = [
    'rounded-md border bg-[var(--bg-raised)] p-5 shadow-warm-sm mb-4 cursor-pointer',
    'transition-all duration-200 motion-safe:hover:-translate-y-[1px] motion-safe:hover:shadow-warm-md',
    cardIsAnswered ? 'border-[var(--answered-border)]' : 'border-[var(--border-soft)]',
    isPinned
      ? 'border-vesper-300/50 bg-gradient-to-b from-vesper-50/60 to-[var(--bg-raised)] shadow-[inset_0_2px_0_theme(colors.vesper.200),var(--shadow-warm-sm)]'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {/* Whole-card click is a mouse convenience; keyboard users reach the post
          via the author link and the "Comment"/"View thread" links inside, so the
          card itself stays a plain (non-focusable) region rather than a nested link. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <article
        className={cardClass}
        onClick={(e) => {
          if (isCardBodyClick(e)) navigate(`/posts/${post.id}`);
        }}
      >
        <header className="mb-2.5 flex items-center gap-3">
          {post.author_id ? (
            <Link
              to={`/u/${post.author_id}`}
              aria-label={`View ${name}'s profile`}
              className="shrink-0"
            >
              <Avatar
                name={name}
                avatarUrl={post.avatar_url}
                anonymous={isOrphanAuthor}
                size="md"
              />
            </Link>
          ) : (
            <Avatar name={name} avatarUrl={post.avatar_url} anonymous={isOrphanAuthor} size="md" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-serif text-[15px] font-medium text-[var(--fg-1)]">
              {post.author_id ? (
                <Link to={`/u/${post.author_id}`} className="hover:underline">
                  {name}
                </Link>
              ) : (
                <span>{name}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--fg-3)]">
              {post.pinned_at !== null ? (
                <span role="img" aria-label="Pinned" title="Pinned" className="inline-flex">
                  <Icon name="pin" size={14} className="text-vesper-500 rotate-[35deg]" />
                </span>
              ) : null}
              <span>{formatAgo(post.created_at)}</span>
              {expiring ? (
                <>
                  <span aria-hidden>·</span>
                  <Pill kind="warm" leadingIcon="clock">
                    {expiring}
                  </Pill>
                </>
              ) : null}
              {post.extended_at ? (
                <>
                  <span aria-hidden>·</span>
                  <Pill kind="default" leadingIcon="clock">
                    {post.extended_by
                      ? `Extended by ${post.extended_by.display_name}`
                      : 'Extended by a moderator'}
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
            onExtend={() => setExtendOpen(true)}
            onDelete={handleDelete}
            {...(onRepost !== undefined ? { onRepost } : {})}
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
        <ExpandableText
          text={post.body}
          threshold={600}
          textClassName="m-0 font-serif text-[18px] leading-relaxed text-[var(--fg-2)] whitespace-pre-wrap [text-wrap:pretty]"
        />
        <PostImages images={post.images} variant="card" />

        {showRibbon ? (
          <div className="mt-4 -mx-5 px-5 py-2.5 border-t border-[var(--answered-border)] bg-gradient-to-r from-dawn-50 to-transparent flex items-center gap-2 text-[13px] font-semibold text-[var(--answered-fg)] tracking-[0.02em]">
            <Icon name="sunrise" size={16} />
            <span>Prayer answered</span>
          </div>
        ) : null}
        {inlineUpdates.length > 0 ? (
          <div className="mt-4">
            {inlineUpdates.map((u) => (
              <UpdatePostItem
                key={u.id}
                update={u}
                embedded
                truncateThreshold={250}
                suppressAnsweredWrapper
              />
            ))}
            {olderCount > 0 ? (
              <Link
                to={`/posts/${post.id}`}
                className="mt-1.5 inline-flex items-center text-[13px] font-medium text-[var(--fg-3)] hover:text-[var(--fg-1)]"
              >
                +{olderCount} older {olderCount === 1 ? 'update' : 'updates'} — view all
              </Link>
            ) : null}
          </div>
        ) : null}
        <footer className="mt-4 flex flex-wrap items-center gap-3">
          {post.status === 'archived' && onRepost ? (
            <>
              <Link
                to={`/posts/${post.id}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-[var(--fg-3)] hover:text-[var(--fg-1)] hover:bg-parchment-100 transition-colors"
              >
                <Icon name="chevron-right" size={16} />
                <span>View thread</span>
              </Link>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => void onRepost()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-vesper-600 hover:bg-parchment-100 transition-colors"
              >
                <Icon name="refresh" size={16} />
                <span>Repost</span>
              </button>
            </>
          ) : (
            <>
              <PrayButton
                size="sm"
                prayed={prayer.prayed}
                prayerCount={prayer.prayerCount}
                onToggle={() => void prayer.toggle().catch(() => {})}
              />
              <div className="flex-1" />
              <Reactions
                ariaLabel={`reactions on post by ${name}`}
                reactions={reactions.reactions}
                onToggle={(e) => void reactions.toggle(e).catch(() => {})}
              />
              <Link
                to={`/posts/${post.id}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-[var(--fg-3)] hover:text-[var(--fg-1)] hover:bg-parchment-100 transition-colors"
              >
                <Icon name="message" size={16} />
                <span>Comment</span>
              </Link>
              {showFlagPill ? <FlagCountPill count={flagCount} targetId={post.id} /> : null}
            </>
          )}
        </footer>
      </article>
      <ExtendDialog
        open={extendOpen}
        wasArchived={post.status === 'archived'}
        onCancel={() => setExtendOpen(false)}
        onConfirm={async (days) => {
          await extendPost(post.id, days);
          setExtendOpen(false);
          onChange?.();
        }}
      />
    </>
  );
}
