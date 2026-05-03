import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './useAuth';

type Subscription = { unsubscribe: () => void };
type Callback = (event: string, session: { user: { id: string; email: string } } | null) => void;

const getSessionMock = vi.fn();
const onAuthStateChangeMock = vi.fn();
const signOutMock = vi.fn();
const apiFetchMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
      onAuthStateChange: (cb: Callback): { data: { subscription: Subscription } } =>
        onAuthStateChangeMock(cb),
      signOut: () => signOutMock(),
    },
  },
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

describe('useAuth', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    onAuthStateChangeMock.mockReset();
    signOutMock.mockReset();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({
      id: 'app-user-id',
      email: 'x@y.com',
      displayName: 'X',
      role: 'member',
    });
  });

  it('starts in loading state and resolves to null session when none exists', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    onAuthStateChangeMock.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it('exposes the current session after initialization', async () => {
    const fakeSession = { user: { id: 'u1', email: 'x@y.com' } };
    getSessionMock.mockResolvedValue({ data: { session: fakeSession } });
    onAuthStateChangeMock.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toEqual(fakeSession);
  });

  it('updates session when onAuthStateChange fires', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    let captured: Callback | null = null;
    onAuthStateChangeMock.mockImplementation((cb: Callback) => {
      captured = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const fakeSession = { user: { id: 'u2', email: 'a@b.com' } };
    await act(async () => {
      captured?.('SIGNED_IN', fakeSession);
    });
    expect(result.current.session).toEqual(fakeSession);
  });
});
