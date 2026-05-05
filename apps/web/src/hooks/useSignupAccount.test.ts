import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSignupAccount } from './useSignupAccount';

const previewMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, previewInviteCode: (c: string) => previewMock(c) };
});

const signUpMock = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signUp: (args: unknown) => signUpMock(args) } },
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
