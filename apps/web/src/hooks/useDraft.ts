import { useCallback, useEffect, useRef, useState } from 'react';

import { getMyDraft, saveMyDraft, type DraftInput } from '../lib/api';

import type { FeedPost } from './useFeed';

const DEBOUNCE_MS = 800;

export interface UseDraftResult {
  loading: boolean;
  draft: FeedPost | null;
  /** Queue a save; the most recent call in a debounce window wins. */
  save: (input: DraftInput) => void;
  /** Flush any pending debounced save and wait for it to land.
   * Returns the most recent saved draft, or `null` if none exists. */
  flush: () => Promise<FeedPost | null>;
  saving: boolean;
  lastSavedAt: number | null;
  error: string | null;
}

/**
 * Manages the user's single auto-saving draft.
 *
 * On mount, loads the user's existing draft (if any) from `GET /me/draft`.
 * Calls to `save(input)` are debounced by {@link DEBOUNCE_MS}ms; only the most
 * recent input in a burst is sent to the server. `flush()` resolves any
 * pending save immediately — use it before publishing.
 */
export function useDraft(): UseDraftResult {
  const [draft, setDraft] = useState<FeedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<DraftInput | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    void getMyDraft()
      .then((res) => {
        if (!activeRef.current) return;
        setDraft(res.draft);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!activeRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load draft');
        setLoading(false);
      });
    return () => {
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const doSave = useCallback(async (input: DraftInput): Promise<FeedPost | null> => {
    setSaving(true);
    setError(null);
    try {
      const res = await saveMyDraft(input);
      if (!activeRef.current) return res.draft;
      setDraft(res.draft);
      setLastSavedAt(Date.now());
      return res.draft;
    } catch (err: unknown) {
      if (activeRef.current) {
        setError(err instanceof Error ? err.message : 'Save failed');
      }
      return null;
    } finally {
      if (activeRef.current) setSaving(false);
    }
  }, []);

  const save = useCallback(
    (input: DraftInput) => {
      pendingRef.current = input;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const next = pendingRef.current;
        pendingRef.current = null;
        if (next) void doSave(next);
      }, DEBOUNCE_MS);
    },
    [doSave],
  );

  const flush = useCallback(async (): Promise<FeedPost | null> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = pendingRef.current;
    pendingRef.current = null;
    if (next) return await doSave(next);
    return draft;
  }, [doSave, draft]);

  return { loading, draft, save, flush, saving, lastSavedAt, error };
}
