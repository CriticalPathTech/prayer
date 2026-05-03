import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useForgotPassword } from './useForgotPassword';

const resetMock = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { resetPasswordForEmail: (e: string, opts: unknown) => resetMock(e, opts) } },
}));

vi.mock('../lib/authErrorCopy', () => ({
  authErrorCopy: (e: { message: string }) => ({ text: e.message }),
}));

describe('useForgotPassword', () => {
  beforeEach(() => resetMock.mockReset());
  afterEach(() => vi.clearAllMocks());

  it('flips sent=true on success', async () => {
    resetMock.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useForgotPassword());
    act(() => result.current.setEmail('m@t.local'));
    await act(async () => {
      await result.current.submit();
    });
    await waitFor(() => expect(result.current.sent).toBe(true));
    expect(resetMock).toHaveBeenCalledWith('m@t.local', expect.any(Object));
  });

  it('surfaces error on failure', async () => {
    resetMock.mockResolvedValue({ error: { message: 'rate limit' } });
    const { result } = renderHook(() => useForgotPassword());
    act(() => result.current.setEmail('m@t.local'));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBe('rate limit');
    expect(result.current.sent).toBe(false);
  });
});
