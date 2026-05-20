import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUserPosts } from './useUserPosts';

const apiFetchMock = vi.fn();
vi.mock('../lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

describe('useUserPosts', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('fetches /users/:userId/posts on mount', async () => {
    apiFetchMock.mockResolvedValue({
      posts: [{ id: 'p1' }],
      nextCursor: null,
      snapshotId: 'p1',
    });
    const { result } = renderHook(() => useUserPosts('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiFetchMock).toHaveBeenCalledWith('/users/u1/posts');
    expect(result.current.posts.map((p) => p.id)).toEqual(['p1']);
  });

  it('appends posts on loadMore', async () => {
    apiFetchMock
      .mockResolvedValueOnce({ posts: [{ id: 'p1' }], nextCursor: 'cur1', snapshotId: 'p1' })
      .mockResolvedValueOnce({ posts: [{ id: 'p2' }], nextCursor: null, snapshotId: 'p1' });
    const { result } = renderHook(() => useUserPosts('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.loadMore();
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/users/u1/posts?cursor=cur1');
    expect(result.current.posts.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('surfaces error on failure', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useUserPosts('u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
  });
});
