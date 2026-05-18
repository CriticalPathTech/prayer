import type { JSX } from 'react';
import { useEffect, useState } from 'react';

import { PostCard } from '../components/PostCard';
import { useRepostFromArchive } from '../hooks/useRepostFromArchive';
import type { FeedPost } from '../hooks/useFeed';
import { useRepostFromArchive } from '../hooks/useRepostFromArchive';
import { apiFetch } from '../lib/api';

export function MyArchivePage(): JSX.Element {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { repost, confirmDialog } = useRepostFromArchive();

  useEffect(() => {
    apiFetch<{ posts: FeedPost[] }>('/posts/me/archive')
      .then((r) => setPosts(r.posts))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed'));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-feed">
        <p className="text-sm text-ember-600">{error}</p>
      </div>
    );
  }
  if (!posts) {
    return (
      <div className="mx-auto max-w-feed">
        <p className="py-16 text-center text-sm text-[var(--fg-3)]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-feed">
      <h1 className="mb-2 font-serif text-[28px] font-semibold tracking-[-0.02em] text-[var(--fg-1)]">
        My Archive
      </h1>
      <p className="mb-6 text-sm text-[var(--fg-3)]">Only you can see this.</p>
      {posts.length === 0 ? (
        <p className="py-16 text-center font-serif text-[18px] text-[var(--fg-3)]">
          Your archive is empty.
        </p>
      ) : (
        <ul>
          {posts.map((p) => (
            <li key={p.id} className="opacity-60">
              <PostCard post={p} onRepost={() => repost(p)} />
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </div>
  );
}
