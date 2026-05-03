import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeedSnapshot } from './useFeedSnapshot';

const apiFetchMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

describe('useFeedSnapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout'], shouldAdvanceTime: true });
    apiFetchMock.mockReset();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches on mount and reports no change if snapshotId matches', async () => {
    apiFetchMock.mockResolvedValue({ snapshotId: 's1' });
    const onNew = vi.fn();
    renderHook(() => useFeedSnapshot({ currentSnapshotId: 's1', onNew }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/feed/snapshot'));
    expect(onNew).not.toHaveBeenCalled();
  });

  it('calls onNew when the remote snapshotId advances', async () => {
    apiFetchMock.mockResolvedValueOnce({ snapshotId: 's2' });
    const onNew = vi.fn();
    renderHook(() => useFeedSnapshot({ currentSnapshotId: 's1', onNew }));
    await waitFor(() => expect(onNew).toHaveBeenCalledWith('s2'));
  });

  it('re-polls after the interval', async () => {
    apiFetchMock.mockResolvedValue({ snapshotId: 's1' });
    renderHook(() =>
      useFeedSnapshot({ currentSnapshotId: 's1', onNew: vi.fn(), intervalMs: 30_000 }),
    );
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
  });

  it('does not fetch while document.hidden is true', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    apiFetchMock.mockResolvedValue({ snapshotId: 's1' });
    renderHook(() => useFeedSnapshot({ currentSnapshotId: 's1', onNew: vi.fn() }));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('fires one fetch on visibilitychange → visible', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    apiFetchMock.mockResolvedValue({ snapshotId: 's1' });
    renderHook(() => useFeedSnapshot({ currentSnapshotId: 's1', onNew: vi.fn() }));
    expect(apiFetchMock).not.toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
  });

  it('skips polling while currentSnapshotId is the zero sentinel', async () => {
    apiFetchMock.mockResolvedValue({ snapshotId: 's1' });
    const onNew = vi.fn();
    renderHook(() =>
      useFeedSnapshot({
        currentSnapshotId: '00000000-0000-0000-0000-000000000000',
        onNew,
      }),
    );
    // Let microtasks drain
    await Promise.resolve();
    await Promise.resolve();
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(onNew).not.toHaveBeenCalled();
  });

  it('swallows fetch errors silently', async () => {
    apiFetchMock.mockRejectedValue(new Error('network'));
    const onNew = vi.fn();
    renderHook(() => useFeedSnapshot({ currentSnapshotId: 's1', onNew }));
    // No throw, no onNew call
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(onNew).not.toHaveBeenCalled();
  });

  it('does not fetch when filter is not all', async () => {
    apiFetchMock.mockResolvedValue({ snapshotId: 's1' });
    const onNew = vi.fn();
    renderHook(() => useFeedSnapshot({ currentSnapshotId: 's1', onNew, filter: 'answered' }));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(onNew).not.toHaveBeenCalled();
  });

  it('fetches normally when filter is all', async () => {
    apiFetchMock.mockResolvedValue({ snapshotId: 's1' });
    const onNew = vi.fn();
    renderHook(() => useFeedSnapshot({ currentSnapshotId: 's1', onNew, filter: 'all' }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/feed/snapshot'));
    expect(onNew).not.toHaveBeenCalled();
  });
});
