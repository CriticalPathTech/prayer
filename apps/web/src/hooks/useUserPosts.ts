import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../lib/api';

import type { FeedPost, FeedResponse } from './useFeed';

export interface UseUserPostsResult {
  posts: FeedPost[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useUserPosts(userId: string): UseUserPostsResult {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextCursor: string | null, replace: boolean): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const qs = nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : '';
        const res = await apiFetch<FeedResponse>(`/users/${userId}/posts${qs}`);
        setPosts((old) => (replace ? res.posts : [...old, ...res.posts]));
        setCursor(res.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load posts');
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void load(null, true);
  }, [load]);

  return {
    posts,
    loading,
    error,
    hasMore: cursor !== null,
    loadMore: () => load(cursor, false),
    refresh: () => load(null, true),
  };
}
