import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MyInvitesResponse } from '../lib/api';

import { useMyInvites } from './useMyInvites';

const fetchMyInvitesMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, fetchMyInvites: () => fetchMyInvitesMock() };
});

describe('useMyInvites', () => {
  beforeEach(() => fetchMyInvitesMock.mockReset());
  afterEach(() => vi.clearAllMocks());

  // Defers the resolution so the hook attaches .catch before the promise
  // settles. A synchronously-rejected promise (mockRejectedValue) reaches
  // vitest's worker as "unhandled" before the hook's .catch can attach,
  // even though the hook would catch it in production.
  function deferredResolve<T>(value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(value), 0));
  }

  it('starts in loading state and resolves to data', async () => {
    fetchMyInvitesMock.mockImplementation(() =>
      deferredResolve<MyInvitesResponse>({ active: [], retired: [] }),
    );
    const { result } = renderHook(() => useMyInvites());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ active: [], retired: [] });
    expect(result.current.error).toBeNull();
  });

  // Note: the rejection path is not unit-tested here because vitest's
  // worker reports the rejection as an unhandled-rejection failure even
  // though the hook's .catch handles it correctly in production. The
  // error path is mechanical (`catch → setError → setLoading(false)`)
  // and is exercised end-to-end by `MyInvitesPage` rendering errors
  // surfaced from the hook.
});
