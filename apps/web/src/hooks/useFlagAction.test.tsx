import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFlagAction } from './useFlagAction';

const apiFetchMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetchMock(...a) };
});

describe('useFlagAction', () => {
  beforeEach(() => apiFetchMock.mockReset());
  afterEach(() => apiFetchMock.mockReset());

  it('POSTs to /posts/:id/flags with reason', async () => {
    apiFetchMock.mockResolvedValueOnce({ flag_count: 1 });
    const { result } = renderHook(() => useFlagAction());
    await act(async () => {
      await result.current.submit({
        targetType: 'post',
        postId: 'p1',
        targetId: 'p1',
        reason: 'off_topic',
      });
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/posts/p1/flags',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('POSTs to the comment path when targetType is comment', async () => {
    apiFetchMock.mockResolvedValueOnce({ flag_count: 1 });
    const { result } = renderHook(() => useFlagAction());
    await act(async () => {
      await result.current.submit({
        targetType: 'comment',
        postId: 'p1',
        targetId: 'c1',
        reason: 'hateful',
      });
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/posts/p1/comments/c1/flags',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
