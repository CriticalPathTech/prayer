import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePrayer } from './usePrayer';

const apiFetchMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

describe('usePrayer', () => {
  beforeEach(() => apiFetchMock.mockReset());
  afterEach(() => apiFetchMock.mockReset());

  it('toggles prayed state optimistically', async () => {
    apiFetchMock.mockResolvedValueOnce({ prayed: true, prayer_count: 1 });
    const { result } = renderHook(() =>
      usePrayer({ postId: 'p1', initial: { prayed: false, prayerCount: 0 } }),
    );
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.prayed).toBe(true);
    expect(result.current.prayerCount).toBe(1);
  });

  it('reverts on failure', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() =>
      usePrayer({ postId: 'p1', initial: { prayed: false, prayerCount: 0 } }),
    );
    await act(async () => {
      await result.current.toggle().catch(() => {});
    });
    await waitFor(() => expect(result.current.prayed).toBe(false));
  });
});
