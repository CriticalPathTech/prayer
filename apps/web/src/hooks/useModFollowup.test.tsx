import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../lib/api';

import { useModFollowup } from './useModFollowup';

afterEach(() => vi.restoreAllMocks());

describe('useModFollowup', () => {
  it('does not fetch on mount when there is no applied query', () => {
    const spy = vi.spyOn(api, 'getFollowupPosts');
    renderHook(() => useModFollowup({ initial: null }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches when applied query is set, and exposes items + loading transitions', async () => {
    vi.spyOn(api, 'getFollowupPosts').mockResolvedValue({
      items: [{ id: '019e0000-0000-7000-8000-000000000001' } as never],
      next_cursor: null,
    });
    const { result } = renderHook(() => useModFollowup({ initial: null }));
    act(() => {
      result.current.applyAndSearch({
        filters: {
          noPrayers: true,
          noReactions: false,
          noComments: false,
          noUpdates: false,
          noModResponse: false,
        },
        minAge: { value: 3, unit: 'days' },
      });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(1);
  });

  it('loadMore appends the next page and updates the cursor', async () => {
    const get = vi
      .spyOn(api, 'getFollowupPosts')
      .mockResolvedValueOnce({ items: [{ id: 'a' } as never], next_cursor: 'cur1' })
      .mockResolvedValueOnce({ items: [{ id: 'b' } as never], next_cursor: null });
    const { result } = renderHook(() => useModFollowup({ initial: null }));
    act(() => {
      result.current.applyAndSearch({
        filters: {
          noPrayers: true,
          noReactions: false,
          noComments: false,
          noUpdates: false,
          noModResponse: false,
        },
        minAge: { value: 3, unit: 'days' },
      });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.current.nextCursor).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
