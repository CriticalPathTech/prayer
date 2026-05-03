import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLogin } from './useLogin';

const signInMock = vi.fn();
const signOutMock = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (args: unknown) => signInMock(args),
      signOut: () => signOutMock(),
    },
  },
}));

const useAuthMock = vi.fn();
vi.mock('./useAuth', () => ({ useAuth: () => useAuthMock() }));

describe('useLogin', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ session: null });
    signInMock.mockReset();
    signOutMock.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('calls signInWithPassword with email + password', async () => {
    signInMock.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useLogin());
    act(() => {
      result.current.setEmail('m@t.local');
      result.current.setPassword('hunter2');
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(signInMock).toHaveBeenCalledWith({ email: 'm@t.local', password: 'hunter2' });
  });

  it("sets errorMessage on failure to 'That didn't match. Try again.'", async () => {
    signInMock.mockResolvedValue({ error: { message: 'invalid credentials' } });
    const { result } = renderHook(() => useLogin());
    act(() => {
      result.current.setEmail('m@t.local');
      result.current.setPassword('wrong');
    });
    await act(async () => {
      await result.current.submit();
    });
    await waitFor(() => expect(result.current.errorMessage).toMatch(/that didn.?t match/i));
  });

  it('signs out a stale session before signing in fresh', async () => {
    useAuthMock.mockReturnValue({ session: { user: { id: 'stale' } } });
    signOutMock.mockResolvedValue(undefined);
    signInMock.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useLogin());
    act(() => {
      result.current.setEmail('m@t.local');
      result.current.setPassword('hunter2');
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(signOutMock).toHaveBeenCalled();
    expect(signInMock).toHaveBeenCalled();
  });
});
