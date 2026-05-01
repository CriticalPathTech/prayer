import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '../lib/api';

import { useChurchMembers } from './useChurchMembers';
import { useChurchSettings } from './useChurchSettings';
import { useRemoveMember } from './useRemoveMember';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe('useChurchMembers', () => {
  it('fetches members on mount and exposes the list', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      members: [
        {
          id: '1',
          displayName: 'A',
          email: 'a@x.com',
          avatarUrl: null,
          role: 'super_user',
          joinedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: '2',
          displayName: 'B',
          email: 'b@x.com',
          avatarUrl: null,
          role: 'member',
          joinedAt: '2026-01-02T00:00:00Z',
        },
      ],
    });
    const { result } = renderHook(() => useChurchMembers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.members).toHaveLength(2);
    expect(apiFetch).toHaveBeenCalledWith('/admin/church/members');
  });

  it('refresh re-fetches', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ members: [] });
    const { result } = renderHook(() => useChurchMembers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.refresh();
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});

describe('useChurchSettings', () => {
  it('PATCHes /admin/church/settings with displayName', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      org: { id: 'o1', slug: 'hope', displayName: 'New Name' },
    });
    const { result } = renderHook(() => useChurchSettings());
    const out = await result.current.updateDisplayName('New Name');
    expect(out.displayName).toBe('New Name');
    expect(apiFetch).toHaveBeenCalledWith('/admin/church/settings', {
      method: 'PATCH',
      body: JSON.stringify({ displayName: 'New Name' }),
    });
  });
});

describe('useRemoveMember', () => {
  it('DELETEs /admin/church/members/:id', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useRemoveMember());
    await result.current.removeMember('user-123');
    expect(apiFetch).toHaveBeenCalledWith('/admin/church/members/user-123', {
      method: 'DELETE',
    });
  });
});
