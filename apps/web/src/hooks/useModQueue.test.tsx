import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useModQueue } from './useModQueue';

const apiFetchMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetchMock(...a) };
});

describe('useModQueue', () => {
  beforeEach(() => apiFetchMock.mockReset());
  afterEach(() => apiFetchMock.mockReset());

  it('fetches items for the given status on mount', async () => {
    apiFetchMock.mockResolvedValueOnce({ items: [] });
    const { result } = renderHook(() => useModQueue('pending'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiFetchMock).toHaveBeenCalledWith('/mod/queue?status=pending');
  });
});
