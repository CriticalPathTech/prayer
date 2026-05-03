import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../lib/api';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

interface ListResponse {
  items: Notification[];
  next_cursor: string | null;
  unread_count: number;
}

interface MarkReadResponse {
  id: string;
  read_at: string;
}

interface MarkAllResponse {
  updated: number;
}

export interface UseNotificationsResult {
  unreadCount: number;
  items: Notification[] | null;
  loading: boolean;
  error: string | null;
  fetchList: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export function useNotifications(intervalMs = 30_000): UseNotificationsResult {
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelOpenRef = useRef(false);
  const itemsRef = useRef<Notification[] | null>(null);
  const unreadRef = useRef(0);
  itemsRef.current = items;
  unreadRef.current = unreadCount;

  const poll = useCallback(async (): Promise<void> => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await apiFetch<ListResponse>('/notifications?unread=true&limit=1');
      if (!panelOpenRef.current) {
        setUnreadCount(res.unread_count);
        // Seed items from poll response if not yet loaded (avoids a blank
        // state when markRead / markAllRead is called before fetchList resolves).
        if (res.items.length > 0) {
          setItems((prev) => (prev === null ? res.items : prev));
        }
      }
    } catch {
      // silent retry next tick
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await poll();
    })();
    const timer = setInterval(() => void poll(), intervalMs);
    const onVisibility = (): void => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [poll, intervalMs]);

  const fetchList = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    panelOpenRef.current = true;
    try {
      const res = await apiFetch<ListResponse>('/notifications?limit=20');
      setItems(res.items);
      setUnreadCount(res.unread_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id: string): Promise<void> => {
    const prevItems = itemsRef.current;
    const prevCount = unreadRef.current;
    setItems((curr) =>
      curr === null
        ? curr
        : curr.map((n) =>
            n.id === id && n.read_at === null ? { ...n, read_at: new Date().toISOString() } : n,
          ),
    );
    const was = prevItems?.find((n) => n.id === id);
    if (was && was.read_at === null) setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await apiFetch<MarkReadResponse>(`/notifications/${id}/read`, { method: 'POST' });
    } catch (err) {
      setItems(prevItems);
      setUnreadCount(prevCount);
      throw err;
    }
  }, []);

  const markAllRead = useCallback(async (): Promise<void> => {
    const prevItems = itemsRef.current;
    const prevCount = unreadRef.current;
    setItems((curr) =>
      curr === null
        ? curr
        : curr.map((n) => (n.read_at === null ? { ...n, read_at: new Date().toISOString() } : n)),
    );
    setUnreadCount(0);
    try {
      await apiFetch<MarkAllResponse>('/notifications/read-all', { method: 'POST' });
    } catch (err) {
      setItems(prevItems);
      setUnreadCount(prevCount);
      throw err;
    }
  }, []);

  return { unreadCount, items, loading, error, fetchList, markRead, markAllRead };
}
