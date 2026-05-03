import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useReactions, type ReactionMap } from './useReactions';

const apiFetchMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const initial: ReactionMap = { '🙏': { count: 0, mine: false } };

describe('useReactions', () => {
  beforeEach(() => apiFetchMock.mockReset());
  afterEach(() => apiFetchMock.mockReset());

  it('optimistically flips mine and increments count on add', async () => {
    apiFetchMock.mockResolvedValueOnce({ reacted: true, reaction_count: 1 });
    const { result } = renderHook(() =>
      useReactions({ targetType: 'post', postId: 'p1', targetId: 'p1', initial }),
    );
    await act(async () => {
      await result.current.toggle('🙏');
    });
    expect(result.current.reactions['🙏']).toEqual({ count: 1, mine: true });
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/posts/p1/reactions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reverts on failure', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() =>
      useReactions({ targetType: 'post', postId: 'p1', targetId: 'p1', initial }),
    );
    await act(async () => {
      await result.current.toggle('🙏').catch(() => {});
    });
    await waitFor(() => expect(result.current.reactions['🙏']).toEqual({ count: 0, mine: false }));
  });

  it('uses comment URL when targetType is comment', async () => {
    apiFetchMock.mockResolvedValueOnce({ reacted: true, reaction_count: 1 });
    const { result } = renderHook(() =>
      useReactions({ targetType: 'comment', postId: 'p1', targetId: 'c1', initial }),
    );
    await act(async () => {
      await result.current.toggle('🙏');
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/posts/p1/comments/c1/reactions',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
