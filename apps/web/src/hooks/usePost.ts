import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiFetch } from '../lib/api';

import type { FeedPost } from './useFeed';
import type { ReactionMap } from './useReactions';

export interface PostDetail {
  post: FeedPost;
  updates: FeedPost[];
  reactions: ReactionMap;
  prayer: { prayer_count: number; prayed: boolean };
}

export interface UsePostResult {
  data: PostDetail | null;
  loading: boolean;
  notFound: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function usePost(postId: string | undefined): UsePostResult {
  const [data, setData] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await apiFetch<PostDetail>(`/posts/${postId}`);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(err instanceof Error ? err.message : 'Failed to load post');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, notFound, error, reload };
}
