import { useEffect, useRef } from 'react';

import { apiFetch } from '../lib/api';

const ZERO_SNAPSHOT_ID = '00000000-0000-0000-0000-000000000000';

export interface UseFeedSnapshotOptions {
  /** The snapshotId the feed last saw (from its /feed response). */
  currentSnapshotId: string;
  /** Called when the remote snapshotId differs from currentSnapshotId. */
  onNew: (remoteSnapshotId: string) => void;
  /** Poll cadence in ms. Defaults to 30 000. */
  intervalMs?: number;
  /** Current filter tab. Polling is skipped entirely when not 'all'. */
  filter?: string;
}

export function useFeedSnapshot({
  currentSnapshotId,
  onNew,
  filter,
  intervalMs = 30_000,
}: UseFeedSnapshotOptions): void {
  const currentRef = useRef(currentSnapshotId);
  const onNewRef = useRef(onNew);
  const filterRef = useRef(filter ?? 'all');
  currentRef.current = currentSnapshotId;
  onNewRef.current = onNew;
  filterRef.current = filter ?? 'all';

  const pollRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      if (cancelled) return;
      if (filterRef.current !== 'all') return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (currentRef.current === ZERO_SNAPSHOT_ID) return;
      try {
        const res = await apiFetch<{ snapshotId: string }>('/feed/snapshot');
        if (cancelled) return;
        if (res.snapshotId !== currentRef.current) onNewRef.current(res.snapshotId);
      } catch {
        // silent retry on next tick
      }
    }

    pollRef.current = poll;

    void poll();
    const timer = setInterval(() => void poll(), intervalMs);

    function onVisibility(): void {
      if (!document.hidden) void poll();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  const prevSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSnapshotRef.current;
    prevSnapshotRef.current = currentSnapshotId;
    if (prev === ZERO_SNAPSHOT_ID && currentSnapshotId !== ZERO_SNAPSHOT_ID) {
      void pollRef.current();
    }
  }, [currentSnapshotId]);
}
