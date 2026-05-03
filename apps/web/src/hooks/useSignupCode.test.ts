import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSignupCode } from './useSignupCode';

const previewMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, previewInviteCode: (c: string) => previewMock(c) };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

describe('useSignupCode', () => {
  beforeEach(() => {
    previewMock.mockReset();
    navigateMock.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('rejects codes that are not 5 chars', async () => {
    const { result } = renderHook(() => useSignupCode());
    act(() => result.current.setCode('abc'));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toMatch(/5 characters/i);
    expect(previewMock).not.toHaveBeenCalled();
  });

  it("navigates to /signup/account?code=… on 'valid' status", async () => {
    previewMock.mockResolvedValue({ status: 'valid' });
    const { result } = renderHook(() => useSignupCode());
    act(() => result.current.setCode('ABCDE'));
    await act(async () => {
      await result.current.submit();
    });
    expect(previewMock).toHaveBeenCalledWith('abcde');
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/signup/account?code=abcde'));
  });

  it("sets a not-found error when status is 'not_found'", async () => {
    previewMock.mockResolvedValue({ status: 'not_found' });
    const { result } = renderHook(() => useSignupCode());
    act(() => result.current.setCode('ABCDE'));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toMatch(/don.?t recognize/i);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
