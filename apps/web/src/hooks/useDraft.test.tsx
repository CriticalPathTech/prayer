import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDraft } from './useDraft';

vi.mock('../lib/api', () => ({
  getMyDraft: vi.fn(),
  saveMyDraft: vi.fn(),
  // publishMyDraft isn't used by the hook but the module mock needs to be complete
  // if tests that import api through the hook expect it.
  publishMyDraft: vi.fn(),
}));
const api = await import('../lib/api');

const makeDraft = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'p1',
  parent_id: null,
  author_id: 'u1',
  display_name: 'me',
  avatar_url: null,
  status: 'draft',
  is_anonymous: false,
  is_answered_prayer: false,
  body: '',
  reaction_count: 0,
  prayer_count: 0,
  updates: [],
  expires_at: null,
  edit_deadline: new Date(Date.now() + 3600_000).toISOString(),
  created_at: new Date().toISOString(),
  prayed: false,
  reactions: {},
  is_own_post: true,
  hidden_by: null,
  hidden_source: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDraft', () => {
  it('hydrates from GET /me/draft on mount', async () => {
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({
      draft: makeDraft({ body: 'hello' }) as never,
    });
    const { result } = renderHook(() => useDraft());
    expect(result.current.loading).toBe(true);

    await vi.waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.draft?.body).toBe('hello');
  });

  it('exposes draft=null when user has no draft', async () => {
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({ draft: null });
    const { result } = renderHook(() => useDraft());
    await vi.waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.draft).toBeNull();
  });

  it('debounces save() — only the last input in a burst is sent', async () => {
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({ draft: null });
    vi.mocked(api.saveMyDraft).mockResolvedValue({
      draft: makeDraft({ body: 'last' }) as never,
    });
    const { result } = renderHook(() => useDraft());
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.save({ body: 'first' });
      result.current.save({ body: 'second' });
      result.current.save({ body: 'last' });
    });

    // No save fires before the debounce elapses.
    expect(api.saveMyDraft).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(api.saveMyDraft).toHaveBeenCalledTimes(1);
    expect(api.saveMyDraft).toHaveBeenCalledWith({ body: 'last' });
  });

  it('flush() resolves any pending save immediately', async () => {
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({ draft: null });
    vi.mocked(api.saveMyDraft).mockResolvedValue({
      draft: makeDraft({ body: 'pending' }) as never,
    });
    const { result } = renderHook(() => useDraft());
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.save({ body: 'pending' });
    });
    // Still within debounce window; save hasn't fired.
    expect(api.saveMyDraft).not.toHaveBeenCalled();

    let flushed: unknown = 'unset';
    await act(async () => {
      flushed = await result.current.flush();
    });

    expect(api.saveMyDraft).toHaveBeenCalledWith({ body: 'pending' });
    expect((flushed as { body: string } | null)?.body).toBe('pending');
  });

  it('flush() returns the current draft when no save is pending', async () => {
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({
      draft: makeDraft({ body: 'existing' }) as never,
    });
    const { result } = renderHook(() => useDraft());
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    let flushed: unknown;
    await act(async () => {
      flushed = await result.current.flush();
    });

    expect(api.saveMyDraft).not.toHaveBeenCalled();
    expect((flushed as { body: string } | null)?.body).toBe('existing');
  });

  it('surfaces save errors in error state', async () => {
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({ draft: null });
    vi.mocked(api.saveMyDraft).mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => useDraft());
    await vi.waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.save({ body: 'x' });
      await vi.advanceTimersByTimeAsync(900);
    });

    await vi.waitFor(() => expect(result.current.error).toMatch(/network down/i));
  });
});
