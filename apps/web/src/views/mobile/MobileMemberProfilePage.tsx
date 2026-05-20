import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { PostCard } from '../../components/PostCard';
import { Avatar } from '../../components/ui/Avatar';
import { Pill } from '../../components/ui/Pill';
import { useAuth } from '../../hooks/useAuth';
import type { FeedPost } from '../../hooks/useFeed';
import { useUserPosts } from '../../hooks/useUserPosts';
import { apiFetch } from '../../lib/api';

import { MobilePageHeader } from './MobilePageHeader';
import { MobileProfilePage } from './MobileProfilePage';
import { MobileSecurityPage } from './MobileSecurityPage';

interface UserDto {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: 'member' | 'moderator' | 'super_user';
}

type TabKey = 'requests' | 'settings' | 'security';

export function MobileMemberProfilePage(): JSX.Element {
  const { userId = '' } = useParams<{ userId: string }>();
  const { me } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [target, setTarget] = useState<UserDto | null>(null);
  const [notFound, setNotFound] = useState(false);
  const { posts, loading, error, hasMore, loadMore } = useUserPosts(userId);

  const isSelf = !!me && me.id === userId;
  const tabParam = searchParams.get('tab');
  const activeTab: TabKey =
    tabParam === 'settings' ? 'settings' : tabParam === 'security' ? 'security' : 'requests';

  useEffect(() => {
    let cancelled = false;
    setTarget(null);
    setNotFound(false);
    void (async () => {
      try {
        const dto = await apiFetch<UserDto>(`/users/${userId}`);
        if (!cancelled) setTarget(dto);
      } catch {
        if (!cancelled) setNotFound(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (notFound) {
    return (
      <>
        <MobilePageHeader variant={{ kind: 'back', title: 'Profile' }} />
        <div className="px-4 py-16 text-center text-sm text-[var(--fg-3)]">Member not found.</div>
      </>
    );
  }

  if (!target) {
    return (
      <>
        <MobilePageHeader variant={{ kind: 'back', title: 'Profile' }} />
        <div className="px-4 py-16 text-center text-sm text-[var(--fg-3)]">Loading…</div>
      </>
    );
  }

  const roleLabel =
    target.role === 'super_user' ? 'Super user' : target.role === 'moderator' ? 'Moderator' : null;

  return (
    <div className="pb-24">
      <MobilePageHeader variant={{ kind: 'back', title: 'Profile' }} />

      <div className="px-4 pb-6 pt-3">
        <header className="mb-5 flex items-center gap-3">
          <Avatar name={target.display_name} avatarUrl={target.avatar_url} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-xl font-semibold text-[var(--fg-1)]">
              {target.display_name}
            </h1>
            {roleLabel ? (
              <div className="mt-1">
                <Pill kind="accent">{roleLabel}</Pill>
              </div>
            ) : null}
          </div>
        </header>

        {isSelf ? (
          <div
            role="tablist"
            className="mb-5 flex border-b border-[var(--border-soft)] pb-0"
          >
            <MobileTabButton
              label="Prayer requests"
              active={activeTab === 'requests'}
              onSelect={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('tab');
                setSearchParams(next, { replace: true });
              }}
            />
            <MobileTabButton
              label="Settings"
              active={activeTab === 'settings'}
              onSelect={() => setSearchParams({ tab: 'settings' }, { replace: true })}
            />
            <MobileTabButton
              label="Security"
              active={activeTab === 'security'}
              onSelect={() => setSearchParams({ tab: 'security' }, { replace: true })}
            />
          </div>
        ) : null}

        {isSelf && activeTab === 'settings' ? <MobileProfilePage /> : null}
        {isSelf && activeTab === 'security' ? <MobileSecurityPage /> : null}
        {!isSelf || activeTab === 'requests' ? (
          <PostList
            posts={posts}
            loading={loading}
            error={error}
            hasMore={hasMore}
            loadMore={loadMore}
            isSelf={isSelf}
            targetDisplayName={target.display_name}
          />
        ) : null}
      </div>
    </div>
  );
}

interface MobileTabButtonProps {
  label: string;
  active: boolean;
  onSelect: () => void;
}

function MobileTabButton({ label, active, onSelect }: MobileTabButtonProps): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={[
        'flex-1 py-3 text-sm font-medium transition-colors',
        active
          ? 'border-b-2 border-vesper-500 text-[var(--fg-1)]'
          : 'text-[var(--fg-3)] hover:text-[var(--fg-2)]',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

interface PostListProps {
  posts: FeedPost[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  isSelf: boolean;
  targetDisplayName: string;
}

function PostList({
  posts,
  loading,
  error,
  hasMore,
  loadMore,
  isSelf,
  targetDisplayName,
}: PostListProps): JSX.Element {
  if (error) {
    return <div className="text-sm text-ember-600">{error}</div>;
  }
  if (loading && posts.length === 0) {
    return <div className="text-center text-sm text-[var(--fg-3)]">Loading…</div>;
  }
  if (posts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--border-soft)] p-8 text-center text-sm text-[var(--fg-3)]">
        {isSelf
          ? "You haven't posted any prayer requests yet."
          : `${targetDisplayName} hasn't posted any prayer requests yet.`}
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
      {hasMore ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          className="mx-auto mt-2 rounded-md border border-[var(--border-soft)] px-4 py-2 text-sm text-[var(--fg-2)] active:bg-parchment-100"
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}
