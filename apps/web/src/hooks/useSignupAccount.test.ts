import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSignupAccount } from './useSignupAccount';

const previewMock = vi.fn();
const redeemMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    previewInviteCode: (c: string) => previewMock(c),
    redeemInviteCode: (c: string) => redeemMock(c),
  };
});

const signUpMock = vi.fn();
const signInMock = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: (args: unknown) => signUpMock(args),
      signInWithPassword: (args: unknown) => signInMock(args),
    },
  },
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

describe('useSignupAccount', () => {
  beforeEach(() => {
    previewMock.mockReset();
    signUpMock.mockReset();
    signInMock.mockReset();
    redeemMock.mockReset();
    navigateMock.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('redirects to /signup if code is empty', () => {
    renderHook(() => useSignupAccount(''));
    expect(navigateMock).toHaveBeenCalledWith('/signup', { replace: true });
  });

  it("loads preview and sets state to 'ok' on valid code", async () => {
    previewMock.mockResolvedValue({ status: 'valid', church_name: 'Testchurch' });
    const { result } = renderHook(() => useSignupAccount('abcde'));
    await waitFor(() => expect(result.current.preview.kind).toBe('ok'));
  });

  it("sets preview to 'error' for non-valid status", async () => {
    previewMock.mockResolvedValue({ status: 'not_found' });
    const { result } = renderHook(() => useSignupAccount('abcde'));
    await waitFor(() => expect(result.current.preview.kind).toBe('error'));
  });

  it("rejects mismatched passwords with 'Passwords don't match'", async () => {
    previewMock.mockResolvedValue({ status: 'valid' });
    const { result } = renderHook(() => useSignupAccount('abcde'));
    await waitFor(() => expect(result.current.preview.kind).toBe('ok'));
    act(() => {
      result.current.setEmail('m@t.local');
      result.current.setPassword('aaaaaaaa');
      result.current.setConfirm('bbbbbbbb');
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.passwordError).toMatch(/don.?t match/i);
  });

  it('flips alreadyRegistered when signUp returns empty identities', async () => {
    previewMock.mockResolvedValue({ status: 'valid' });
    signUpMock.mockResolvedValue({
      data: { user: { identities: [] } },
      error: null,
    });
    const { result } = renderHook(() => useSignupAccount('abcde'));
    await waitFor(() => expect(result.current.preview.kind).toBe('ok'));
    act(() => {
      result.current.setEmail('m@t.local');
      result.current.setPassword('aaaaaaaa');
      result.current.setConfirm('aaaaaaaa');
    });
    await act(async () => {
      await result.current.submit();
    });
    await waitFor(() => expect(result.current.alreadyRegistered).toBe(true));
  });

  // An existing auth user (removed member, or a member of another church on the
  // same Supabase project) never gets invite_code written to user_metadata, so
  // /auth/callback never redeems for them. joinExisting is their only path in.
  it('joinExisting signs the existing account in and redeems the code', async () => {
    previewMock.mockResolvedValue({ status: 'valid' });
    signInMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    redeemMock.mockResolvedValue({ user: { id: 'u1' } });
    const { result } = renderHook(() => useSignupAccount('abcde'));
    await waitFor(() => expect(result.current.preview.kind).toBe('ok'));
    act(() => {
      result.current.setEmail('m@t.local');
      result.current.setPassword('aaaaaaaa');
    });
    await act(async () => {
      await result.current.joinExisting();
    });
    expect(signInMock).toHaveBeenCalledWith({ email: 'm@t.local', password: 'aaaaaaaa' });
    expect(redeemMock).toHaveBeenCalledWith('abcde');
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
  });

  it('joinExisting surfaces a wrong-password error and does not redeem', async () => {
    previewMock.mockResolvedValue({ status: 'valid' });
    signInMock.mockResolvedValue({
      data: { user: null },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });
    const { result } = renderHook(() => useSignupAccount('abcde'));
    await waitFor(() => expect(result.current.preview.kind).toBe('ok'));
    act(() => {
      result.current.setEmail('m@t.local');
      result.current.setPassword('wrongpass');
    });
    await act(async () => {
      await result.current.joinExisting();
    });
    expect(result.current.joinError).toBeTruthy();
    expect(redeemMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalledWith('/', { replace: true });
  });

  it('joinExisting surfaces a redeem failure without navigating', async () => {
    previewMock.mockResolvedValue({ status: 'valid' });
    signInMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    redeemMock.mockRejectedValue({ code: 'CODE_FULL', message: 'no seats' });
    const { result } = renderHook(() => useSignupAccount('abcde'));
    await waitFor(() => expect(result.current.preview.kind).toBe('ok'));
    act(() => {
      result.current.setEmail('m@t.local');
      result.current.setPassword('aaaaaaaa');
    });
    await act(async () => {
      await result.current.joinExisting();
    });
    expect(result.current.joinError).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalledWith('/', { replace: true });
  });

  it('surfaces formError and does not navigate when signUp returns null user (supabase-js 2.106.0 regression shape)', async () => {
    previewMock.mockResolvedValue({ status: 'valid' });
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
    const { result } = renderHook(() => useSignupAccount('abcde'));
    await waitFor(() => expect(result.current.preview.kind).toBe('ok'));
    act(() => {
      result.current.setEmail('m@t.local');
      result.current.setPassword('aaaaaaaa');
      result.current.setConfirm('aaaaaaaa');
    });
    await act(async () => {
      await result.current.submit();
    });
    await waitFor(() => expect(result.current.formError).toBeTruthy());
    expect(result.current.alreadyRegistered).toBe(false);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('navigates to /signup/check-email on successful signUp', async () => {
    previewMock.mockResolvedValue({ status: 'valid' });
    signUpMock.mockResolvedValue({
      data: { user: { identities: [{ id: 'ok' }] } },
      error: null,
    });
    const { result } = renderHook(() => useSignupAccount('abcde'));
    await waitFor(() => expect(result.current.preview.kind).toBe('ok'));
    act(() => {
      result.current.setEmail('m@t.local');
      result.current.setPassword('aaaaaaaa');
      result.current.setConfirm('aaaaaaaa');
    });
    await act(async () => {
      await result.current.submit();
    });
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/signup/check-email?email=m%40t.local&code=abcde'),
    );
  });
});
