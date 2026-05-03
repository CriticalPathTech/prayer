import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useResetPassword } from './useResetPassword';

let authStateCallback: ((event: string) => void) | null = null;
const updateUserMock = vi.fn();
const subscriptionUnsubscribe = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string) => void) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: subscriptionUnsubscribe } } };
      },
      updateUser: (args: unknown) => updateUserMock(args),
    },
  },
}));

vi.mock('../lib/authErrorCopy', () => ({
  authErrorCopy: (e: { message: string }) => ({ text: e.message }),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

describe('useResetPassword', () => {
  beforeEach(() => {
    authStateCallback = null;
    updateUserMock.mockReset();
    subscriptionUnsubscribe.mockReset();
    navigateMock.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("starts in 'waiting' state", () => {
    const { result } = renderHook(() => useResetPassword());
    expect(result.current.state).toBe('waiting');
  });

  it("transitions to 'ready' on PASSWORD_RECOVERY auth event", () => {
    const { result } = renderHook(() => useResetPassword());
    act(() => {
      authStateCallback?.('PASSWORD_RECOVERY');
    });
    expect(result.current.state).toBe('ready');
  });

  it('rejects mismatched passwords', async () => {
    const { result } = renderHook(() => useResetPassword());
    act(() => authStateCallback?.('PASSWORD_RECOVERY'));
    act(() => {
      result.current.setNext('aaaaaaaa');
      result.current.setConfirm('bbbbbbbb');
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toMatch(/do not match/i);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('navigates to / on successful update', async () => {
    updateUserMock.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useResetPassword());
    act(() => authStateCallback?.('PASSWORD_RECOVERY'));
    act(() => {
      result.current.setNext('aaaaaaaa');
      result.current.setConfirm('aaaaaaaa');
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'aaaaaaaa' });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }));
  });
});
