import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../lib/api';

import type { PostImage } from './useFeed';

export interface ModQueueItem {
  target_type: 'post' | 'comment';
  target_id: string;
  post_id: string;
  author_display_name: string | null;
  preview: string;
  flag_count: number;
  reasons: string[];
  first_flag_at: string;
  latest_flag_at: string;
  hidden: boolean;
  hide_source: 'auto' | 'manual' | null;
  /** Only populated for target_type === 'post'; comments always get []. */
  images: PostImage[];
}

type Status = 'pending' | 'auto_hidden' | 'manually_hidden' | 'hidden';
export type ModQueueStatus = Status;

export interface UseModQueueResult {
  items: ModQueueItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  hideTarget: (targetType: 'post' | 'comment', id: string) => Promise<void>;
  unhideTarget: (targetType: 'post' | 'comment', id: string) => Promise<void>;
  dismissFlags: (targetType: 'post' | 'comment', id: string) => Promise<void>;
}

export function useModQueue(status?: Status): UseModQueueResult {
  const [items, setItems] = useState<ModQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const path = status ? `/mod/queue?status=${status}` : '/mod/queue';
      const res = await apiFetch<{ items: ModQueueItem[] }>(path);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hideTarget = useCallback(
    async (t: 'post' | 'comment', id: string) => {
      await apiFetch(`/mod/${t}s/${id}/hide`, { method: 'POST', body: '{}' });
      await refresh();
    },
    [refresh],
  );
  const unhideTarget = useCallback(
    async (t: 'post' | 'comment', id: string) => {
      await apiFetch(`/mod/${t}s/${id}/unhide`, { method: 'POST', body: '{}' });
      await refresh();
    },
    [refresh],
  );
  const dismissFlags = useCallback(
    async (t: 'post' | 'comment', id: string) => {
      await apiFetch(`/mod/${t}s/${id}/dismiss-flags`, { method: 'POST', body: '{}' });
      await refresh();
    },
    [refresh],
  );

  return { items, loading, error, refresh, hideTarget, unhideTarget, dismissFlags };
}
