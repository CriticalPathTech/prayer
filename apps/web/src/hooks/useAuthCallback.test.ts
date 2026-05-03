import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthCallback } from './useAuthCallback';

let authStateCallback:
  | ((event: string, session: { user?: { user_metadata?: unknown } } | null) => void)
  | null = null;
const subscriptionUnsubscribe = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (
        cb: (event: string, session: { user?: { user_metadata?: unknown } } | null) => void,
      ) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: subscriptionUnsubscribe } } };
      },
    },
  },
}));

const redeemMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, redeemInviteCode: (c: string) => redeemMock(c) };
});

vi.mock('../lib/authErrorCopy', () => ({
  authErrorCopy: (e: { message?: string; code?: string }) => ({
    text: e.message ?? 'error',
  }),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

describe('useAuthCallback', () => {
  beforeEach(() => {
    authStateCallback = null;
    redeemMock.mockReset();
    navigateMock.mockReset();
    subscriptionUnsubscribe.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("starts in 'waiting'", () => {
    const { result } = renderHook(() => useAuthCallback());
    expect(result.current.state).toBe('waiting');
  });

  it('redeems invite code and navigates to / on SIGNED_IN', async () => {
    redeemMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAuthCallback());
    await act(async () => {
      await authStateCallback?.('SIGNED_IN', {
        user: { user_metadata: { invite_code: 'abcde' } },
      });
    });
    expect(redeemMock).toHaveBeenCalledWith('abcde');
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }));
    expect(result.current.state).toBe('redeeming');
  });

  it("sets 'error' state when invite_code is missing", async () => {
    const { result } = renderHook(() => useAuthCallback());
    await act(async () => {
      await authStateCallback?.('SIGNED_IN', { user: { user_metadata: {} } });
    });
    expect(result.current.state).toBe('error');
    expect(result.current.message).toMatch(/invalid/i);
  });
});
