import type { JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { HiddenBanner } from '../../components/HiddenBanner';
import { HideTombstone } from '../../components/HideTombstone';
import { PostMenu } from '../../components/PostMenu';
import { UpdatePostItem } from '../../components/UpdatePostItem';
import { Avatar } from '../../components/ui/Avatar';
import { ExpandableText } from '../../components/ui/ExpandableText';
import { Icon } from '../../components/ui/Icon';
import { Pill } from '../../components/ui/Pill';
import { Reactions } from '../../components/ui/Reactions';
import { useAuth } from '../../hooks/useAuth';
import type { FeedPost } from '../../hooks/useFeed';
import { usePrayer } from '../../hooks/usePrayer';
import { useReactions } from '../../hooks/useReactions';
import { apiFetch } from '../../lib/api';
import { isPrivilegedRole } from '../../lib/roles';
import { expiringSoon, formatAgo } from '../../lib/time';

export interface MobilePostCardProps {
  post: FeedPost;
  onChange?: () => void;
}

export function MobilePostCard({ post, onChange }: MobilePostCardProps): JSX.Element {
  const { me } = useAuth();
  const navigate = useNavigate();
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
      <article className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4 shadow-warm-sm">
        <HideTombstone kind="post" />
      </article>
    );
  }

  const name = post.is_anonymous ? 'Anonymous' : (post.display_name ?? 'Anonymous');
  const expiring = expiringSoon(post.expires_at);
  const answered = post.is_answered_prayer;
  const isPrivileged = isPrivilegedRole(me?.role);
  const isAuthor = !!me && post.is_own_post;
  const showHiddenBanner = post.status === 'hidden' && isAuthor;
  const showModeratorHiddenBanner = post.status === 'hidden' && isPrivileged && !isAuthor;
  const answeredUpdates = post.answered_updates ?? [];

  const cardClass = [
    'flex flex-col gap-3 rounded-lg border bg-[var(--bg-raised)] p-4 shadow-warm-sm',
    answered ? 'border-[var(--answered-border)]' : 'border-[var(--border-soft)]',
  ].join(' ');

  return (
    <article className={cardClass}>
      <header className="flex items-start gap-2.5">
        <Avatar name={name} avatarUrl={post.avatar_url} anonymous={post.is_anonymous} size="md" />
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[15px] font-semibold leading-tight text-[var(--fg-1)]">
            <Link to={`/posts/${post.id}`} className="hover:underline">
              {name}
            </Link>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--fg-3)]">
            <span>{formatAgo(post.created_at)}</span>
            {expiring ? (
              <>
                <span aria-hidden className="text-[var(--fg-4)]">
                  ·
                </span>
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
          onDelete={handleDelete}
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
        threshold={280}
        textClassName="m-0 font-serif text-[16px] leading-[1.55] text-[var(--fg-2)] whitespace-pre-wrap [text-wrap:pretty]"
      />

      <Reactions
        ariaLabel={`reactions on post by ${name}`}
        reactions={reactions.reactions}
        onToggle={(e) => void reactions.toggle(e).catch(() => {})}
      />

      {answered && answeredUpdates.length === 0 ? (
        <div className="-mx-4 mt-1 flex items-center gap-2 border-t border-[var(--answered-border)] bg-gradient-to-r from-dawn-50 to-transparent px-4 py-2.5 text-[13px] font-semibold tracking-[0.02em] text-[var(--answered-fg)]">
          <Icon name="sunrise" size={16} />
          <span>Prayer answered</span>
        </div>
      ) : null}
      {answeredUpdates.length > 0 ? (
        <div>
          {answeredUpdates.map((u) => (
            <UpdatePostItem key={u.id} update={u} embedded />
          ))}
        </div>
      ) : null}

      <footer className="-mx-4 flex items-center gap-1 border-t border-[var(--border-soft)] px-4 pt-2">
        <button
          type="button"
          disabled={prayer.prayed}
          onClick={() => void prayer.toggle().catch(() => {})}
          className={[
            'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] font-semibold',
            'active:bg-parchment-100',
            prayer.prayed ? 'text-sage-600' : 'text-vesper-600',
          ].join(' ')}
        >
          <Icon name={prayer.prayed ? 'check' : 'pray'} size={16} />
          <span>
            {prayer.prayed
              ? `Prayed · ${prayer.prayerCount}`
              : `I Will Pray · ${prayer.prayerCount}`}
          </span>
        </button>
        <span aria-hidden className="h-[18px] w-px bg-[var(--border-soft)]" />
        <button
          type="button"
          onClick={() => navigate(`/posts/${post.id}`)}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium text-[var(--fg-3)] active:bg-parchment-100"
        >
          <Icon name="message" size={16} />
          <span>Comment</span>
        </button>
      </footer>
    </article>
  );
}
