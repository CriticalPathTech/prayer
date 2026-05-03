import { useCallback, useRef, useState } from 'react';

import { apiFetch } from '../lib/api';

export interface UsePrayerInput {
  postId: string;
  initial: { prayed: boolean; prayerCount: number };
}

export interface UsePrayerResult {
  prayed: boolean;
  prayerCount: number;
  toggle: () => Promise<void>;
}

interface TogglePrayerResponse {
  prayed: boolean;
  prayer_count: number;
}

export function usePrayer(input: UsePrayerInput): UsePrayerResult {
  const [prayed, setPrayed] = useState(input.initial.prayed);
  const [prayerCount, setPrayerCount] = useState(input.initial.prayerCount);
  const inFlight = useRef(false);

  const toggle = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    const prevPrayed = prayed;
    const prevCount = prayerCount;
    setPrayed(!prevPrayed);
    setPrayerCount(prevCount + (prevPrayed ? -1 : 1));
    try {
      await apiFetch<TogglePrayerResponse>(`/posts/${input.postId}/pray`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch (err) {
      setPrayed(prevPrayed);
      setPrayerCount(prevCount);
      throw err;
    } finally {
      inFlight.current = false;
    }
  }, [prayed, prayerCount, input.postId]);

  return { prayed, prayerCount, toggle };
}
