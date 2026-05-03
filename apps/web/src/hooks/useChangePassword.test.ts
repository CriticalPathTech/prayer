import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useChangePassword } from './useChangePassword';

const useAuthMock = vi.fn();
vi.mock('./useAuth', () => ({ useAuth: () => useAuthMock() }));

const signInWithPasswordMock = vi.fn();
const updateUserMock = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (args: unknown) => signInWithPasswordMock(args),
      updateUser: (args: unknown) => updateUserMock(args),
    },
  },
}));

vi.mock('../lib/authErrorCopy', () => ({
  authErrorCopy: (e: { message: string }) => ({ text: e.message }),
}));

describe('useChangePassword', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      me: { id: 'me', email: 'm@t.local', displayName: 'Mary', avatarUrl: null, role: 'member' },
    });
    signInWithPasswordMock.mockReset();
    updateUserMock.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('rejects when next !== confirm', async () => {
    const { result } = renderHook(() => useChangePassword());
    act(() => {
      result.current.setCurrent('cur');
      result.current.setNext('aaaaaaaa');
      result.current.setConfirm('bbbbbbbb');
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toMatch(/do not match/i);
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('reauthenticates then updates password and sets ok', async () => {
    signInWithPasswordMock.mockResolvedValue({ error: null });
    updateUserMock.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useChangePassword());
    act(() => {
      result.current.setCurrent('cur');
      result.current.setNext('aaaaaaaa');
      result.current.setConfirm('aaaaaaaa');
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(signInWithPasswordMock).toHaveBeenCalledWith({ email: 'm@t.local', password: 'cur' });
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'aaaaaaaa' });
    await waitFor(() => expect(result.current.ok).toBe(true));
    expect(result.current.current).toBe('');
    expect(result.current.next).toBe('');
    expect(result.current.confirm).toBe('');
  });

  it('surfaces error when reauth fails', async () => {
    signInWithPasswordMock.mockResolvedValue({ error: { message: 'wrong password' } });
    const { result } = renderHook(() => useChangePassword());
    act(() => {
      result.current.setCurrent('cur');
      result.current.setNext('aaaaaaaa');
      result.current.setConfirm('aaaaaaaa');
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBe('wrong password');
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});
