import { useCallback, useEffect, useState } from 'react';

import {
  getFollowupPosts,
  type FollowupFilters,
  type FollowupResponse,
} from '../lib/api';
import type { FollowupDraft } from '../lib/mod-followup-pills';

import type { FeedPost } from './useFeed';

export interface AppliedQuery extends FollowupDraft {
  sort: 'oldest' | 'newest';
}

export interface UseModFollowupResult {
  items: FeedPost[];
  applied: AppliedQuery | null;
  nextCursor: string | null;
  loading: boolean;
  searched: boolean;
  error: string | null;
  applyAndSearch: (draft: FollowupDraft) => void;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export interface UseModFollowupOptions {
  initial: AppliedQuery | null;
}

function toApi(draft: FollowupDraft): { filters: FollowupFilters; minAge: FollowupDraft['minAge'] } {
  return { filters: draft.filters, minAge: draft.minAge };
}

export function useModFollowup(opts: UseModFollowupOptions): UseModFollowupResult {
  const [applied, setApplied] = useState<AppliedQuery | null>(opts.initial);
  const [items, setItems] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runFresh = useCallback(async (q: AppliedQuery) => {
    setLoading(true);
    setError(null);
    try {
      const res: FollowupResponse = await getFollowupPosts({
        ...toApi(q),
        sort: q.sort,
      });
      setItems(res.items);
      setNextCursor(res.next_cursor);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (applied) void runFresh(applied);
  }, [applied, runFresh]);

  const applyAndSearch = useCallback((draft: FollowupDraft) => {
    setApplied({ ...draft, sort: 'oldest' });
  }, []);

  const loadMore = useCallback(async () => {
    if (!applied || !nextCursor) return;
    setLoading(true);
    try {
      const res = await getFollowupPosts({ ...toApi(applied), sort: applied.sort, cursor: nextCursor });
      setItems((prev) => [...prev, ...res.items]);
      setNextCursor(res.next_cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [applied, nextCursor]);

  const refresh = useCallback(async () => {
    if (applied) await runFresh(applied);
  }, [applied, runFresh]);

  return { items, applied, nextCursor, loading, searched, error, applyAndSearch, loadMore, refresh };
}
