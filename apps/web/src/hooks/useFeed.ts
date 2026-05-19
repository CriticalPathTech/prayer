import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../lib/api';

export type FeedFilter = 'all' | 'mine' | 'answered';

export interface FeedPost {
  id: string;
  parent_id: string | null;
  author_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: 'draft' | 'published' | 'archived' | 'hidden';
  is_anonymous: boolean;
  is_answered_prayer: boolean;
  body: string;
  reaction_count: number;
  prayer_count: number;
  expires_at: string | null;
  edit_deadline: string;
  created_at: string;
  /** ISO timestamp when this post was pinned; null when not pinned. */
  pinned_at: string | null;
  /** Mod or super_user who pinned this post; null when not pinned. */
  pinned_by: { id: string; display_name: string } | null;
  prayed: boolean;
  reactions: Record<string, { count: number; mine: boolean }>;
  is_own_post: boolean;
  /** Set only when the caller is a moderator and the post is hidden;
   * null for auto-hides. */
  hidden_by: { id: string; display_name: string } | null;
  hidden_source: 'auto' | 'manual' | null;
  /** True when the author has been removed from this org. Render the
   * author as "Former member" + generic avatar. is_anonymous takes
   * precedence for display masking. */
  is_former_member: boolean;
  is_tombstone?: boolean;
  flag_count?: number;
  /** Every published child update for this parent, oldest → newest.
   * Empty array when the parent has no children. Always present on
   * /feed responses; absent on /posts/me/archive (PostCard handles
   * the undefined case defensively). Privileged callers (mods /
   * super_user) also see hidden updates with hidden_by attribution. */
  updates: FeedPost[];
}

export interface FeedResponse {
  posts: FeedPost[];
  /** Pinned posts returned on the first page only; absent on cursor pages. */
  pinned?: FeedPost[];
  nextCursor: string | null;
  snapshotId: string;
}

export interface UseFeedResult {
  posts: FeedPost[];
  /** Pinned posts for the current feed; populated on first/replace fetches. */
  pinned: FeedPost[];
  filter: FeedFilter;
  setFilter: (f: FeedFilter) => void;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  snapshotId: string;
  refresh: () => Promise<void>;
}

export interface UseFeedOptions {
  /** Initial filter to seed the first fetch. Defaults to 'all'. Callers
   * that drive the filter externally (e.g. mobile reads it from the URL)
   * can also call `setFilter` to override later. */
  initialFilter?: FeedFilter;
}

export function useFeed(opts?: UseFeedOptions): UseFeedResult {
  const [filter, setFilter] = useState<FeedFilter>(opts?.initialFilter ?? 'all');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [pinned, setPinned] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotId, setSnapshotId] = useState<string>('00000000-0000-0000-0000-000000000000');

  const load = useCallback(
    async (nextCursor: string | null, replace: boolean): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ filter });
        if (nextCursor) qs.set('cursor', nextCursor);
        const res = await apiFetch<FeedResponse>(`/feed?${qs.toString()}`);
        setPosts((old) => (replace ? res.posts : [...old, ...res.posts]));
        if (replace) setPinned(res.pinned ?? []);
        setCursor(res.nextCursor);
        setSnapshotId(res.snapshotId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load feed');
      } finally {
        setLoading(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    void load(null, true);
  }, [load]);

  return {
    posts,
    pinned,
    filter,
    setFilter,
    loading,
    error,
    hasMore: cursor !== null,
    loadMore: () => load(cursor, false),
    snapshotId,
    refresh: () => load(null, true),
  };
}
