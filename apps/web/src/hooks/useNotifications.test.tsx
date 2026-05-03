import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNotifications } from './useNotifications';

const apiFetchMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

describe('useNotifications', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });
  afterEach(() => {
    apiFetchMock.mockReset();
  });

  it('polls unread count on mount', async () => {
    apiFetchMock.mockResolvedValue({ items: [], next_cursor: null, unread_count: 3 });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.unreadCount).toBe(3));
    expect(apiFetchMock).toHaveBeenCalledWith('/notifications?unread=true&limit=1');
  });

  it('fetchList loads full items', async () => {
    apiFetchMock.mockResolvedValueOnce({ items: [], next_cursor: null, unread_count: 0 });
    apiFetchMock.mockResolvedValueOnce({
      items: [
        {
          id: 'n1',
          user_id: 'u',
          type: 'comment.created',
          payload: { preview: 'hi' },
          read_at: null,
          created_at: '2026-04-18T00:00:00Z',
        },
      ],
      next_cursor: null,
      unread_count: 1,
    });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    await act(async () => {
      await result.current.fetchList();
    });
    expect(result.current.items).toHaveLength(1);
  });

  it('markRead flips read_at optimistically and decrements unreadCount', async () => {
    apiFetchMock.mockResolvedValueOnce({
      items: [
        {
          id: 'n1',
          user_id: 'u',
          type: 'comment.created',
          payload: { preview: 'hi' },
          read_at: null,
          created_at: '2026-04-18T00:00:00Z',
        },
      ],
      next_cursor: null,
      unread_count: 1,
    });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    await act(async () => {
      await result.current.fetchList();
    });
    apiFetchMock.mockResolvedValueOnce({ id: 'n1', read_at: '2026-04-18T00:01:00Z' });
    await act(async () => {
      await result.current.markRead('n1');
    });
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.items?.[0]?.read_at).not.toBeNull();
  });

  it('markAllRead flips everything and zeros unreadCount', async () => {
    apiFetchMock.mockResolvedValueOnce({
      items: [
        {
          id: 'n1',
          user_id: 'u',
          type: 'comment.created',
          payload: { preview: 'hi' },
          read_at: null,
          created_at: '2026-04-18T00:00:00Z',
        },
        {
          id: 'n2',
          user_id: 'u',
          type: 'comment.created',
          payload: { preview: 'hi' },
          read_at: null,
          created_at: '2026-04-18T00:00:00Z',
        },
      ],
      next_cursor: null,
      unread_count: 2,
    });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    await act(async () => {
      await result.current.fetchList();
    });
    apiFetchMock.mockResolvedValueOnce({ updated: 2 });
    await act(async () => {
      await result.current.markAllRead();
    });
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.items?.every((i) => i.read_at !== null)).toBe(true);
  });
});
