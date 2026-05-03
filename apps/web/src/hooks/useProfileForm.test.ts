import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProfileForm } from './useProfileForm';

const updateMyProfileMock = vi.fn();
const deleteMyAvatarMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    updateMyProfile: (...args: Parameters<typeof actual.updateMyProfile>) =>
      updateMyProfileMock(...args),
    deleteMyAvatar: (...args: Parameters<typeof actual.deleteMyAvatar>) =>
      deleteMyAvatarMock(...args),
  };
});

const useAuthMock = vi.fn();
vi.mock('./useAuth', () => ({ useAuth: () => useAuthMock() }));

const baseMe = {
  id: 'me',
  email: 'm@t.local',
  displayName: 'Mary',
  avatarUrl: null as string | null,
  role: 'member' as const,
};

describe('useProfileForm', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ me: baseMe, refreshMe: vi.fn().mockResolvedValue(undefined) });
    updateMyProfileMock.mockReset();
    deleteMyAvatarMock.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('seeds displayName from me; dirty=false', () => {
    const { result } = renderHook(() => useProfileForm());
    expect(result.current.displayName).toBe('Mary');
    expect(result.current.dirty).toBe(false);
  });

  it('marks dirty when displayName changes', () => {
    const { result } = renderHook(() => useProfileForm());
    act(() => result.current.setDisplayName('Mary D'));
    expect(result.current.dirty).toBe(true);
  });

  it('save() calls updateMyProfile, refreshes, and clears dirty', async () => {
    const refreshMe = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue({ me: baseMe, refreshMe });
    updateMyProfileMock.mockResolvedValue({ ...baseMe, displayName: 'Mary D' });
    const { result } = renderHook(() => useProfileForm());
    act(() => result.current.setDisplayName('Mary D'));
    await act(async () => {
      await result.current.save();
    });
    expect(updateMyProfileMock).toHaveBeenCalledWith({ display_name: 'Mary D' });
    expect(refreshMe).toHaveBeenCalled();
    await waitFor(() => expect(result.current.justSaved).toBe(true));
  });

  it('save() surfaces error from updateMyProfile', async () => {
    updateMyProfileMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useProfileForm());
    act(() => result.current.setDisplayName('Mary D'));
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.saveError).toBe('boom');
  });

  it('confirmRemove() calls deleteMyAvatar + refreshes + clears pendingRemove', async () => {
    const refreshMe = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue({ me: { ...baseMe, avatarUrl: 'x' }, refreshMe });
    deleteMyAvatarMock.mockResolvedValue({ ...baseMe, avatarUrl: null });
    const { result } = renderHook(() => useProfileForm());
    act(() => result.current.openRemove());
    expect(result.current.pendingRemove).toBe(true);
    await act(async () => {
      await result.current.confirmRemove();
    });
    expect(deleteMyAvatarMock).toHaveBeenCalled();
    expect(refreshMe).toHaveBeenCalled();
    expect(result.current.pendingRemove).toBe(false);
  });
});
