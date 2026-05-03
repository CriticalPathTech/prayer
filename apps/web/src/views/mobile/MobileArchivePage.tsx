import type { JSX } from 'react';
import { useEffect, useState } from 'react';

import type { FeedPost } from '../../hooks/useFeed';
import { apiFetch } from '../../lib/api';

import { MobilePageHeader } from './MobilePageHeader';
import { MobilePostCard } from './MobilePostCard';

export function MobileArchivePage(): JSX.Element {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ posts: FeedPost[] }>('/posts/me/archive')
      .then((r) => setPosts(r.posts))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed'));
  }, []);

  return (
    <>
      <MobilePageHeader variant={{ kind: 'back', title: 'Archive' }} />
      <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-3">
        {error ? <p className="text-sm text-ember-600">{error}</p> : null}
        {posts === null && !error ? (
          <p className="py-16 text-center text-sm text-[var(--fg-3)]">Loading…</p>
        ) : null}
        {posts !== null && posts.length === 0 ? (
          <p className="py-16 text-center font-serif text-[18px] text-[var(--fg-3)]">
            Your archive is empty.
          </p>
        ) : null}
        {posts?.map((p) => (
          <div key={p.id} className="opacity-60">
            <MobilePostCard post={p} />
          </div>
        ))}
      </div>
    </>
  );
}
