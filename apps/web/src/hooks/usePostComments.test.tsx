import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePostComments } from './usePostComments';

const apiFetchMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const thread = (partial: Record<string, unknown> = {}) => ({
  participant_id: 'u1',
  participant_display_name: 'Alice',
  comments: [],
  ...partial,
});

describe('usePostComments', () => {
  beforeEach(() => apiFetchMock.mockReset());
  afterEach(() => apiFetchMock.mockReset());

  it('fetches threads on mount', async () => {
    apiFetchMock.mockResolvedValueOnce({ threads: [thread()] });
    const { result } = renderHook(() => usePostComments('post-id'));
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(apiFetchMock).toHaveBeenCalledWith('/posts/post-id/comments');
  });

  it('addComment posts and reloads', async () => {
    apiFetchMock
      .mockResolvedValueOnce({ threads: [] }) // mount
      .mockResolvedValueOnce({ comment: { id: 'c1', body: 'hi' } }) // POST
      .mockResolvedValueOnce({ threads: [thread()] }); // reload
    const { result } = renderHook(() => usePostComments('post-id'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.addComment({ body: 'hi' });
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      '/posts/post-id/comments',
      expect.objectContaining({ method: 'POST' }),
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
  });

  it('surfaces error on fetch failure', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => usePostComments('post-id'));
    await waitFor(() => expect(result.current.error).toBe('boom'));
  });
});
