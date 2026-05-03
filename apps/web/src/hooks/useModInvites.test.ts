import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useModInvites } from './useModInvites';

const searchUsersModMock = vi.fn();
const listInviteCodesModMock = vi.fn();
const grantInviteCodeModMock = vi.fn();
const retireInviteCodeModMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    searchUsersMod: (q: string) => searchUsersModMock(q),
    listInviteCodesMod: (id: string) => listInviteCodesModMock(id),
    grantInviteCodeMod: (id: string, n: number) => grantInviteCodeModMock(id, n),
    retireInviteCodeMod: (id: string) => retireInviteCodeModMock(id),
  };
});

const SAMPLE_USER = {
  id: 'u1',
  display_name: 'Alice',
  email: 'a@t.local',
};

describe('useModInvites', () => {
  beforeEach(() => {
    searchUsersModMock.mockReset();
    listInviteCodesModMock.mockReset();
    grantInviteCodeModMock.mockReset();
    retireInviteCodeModMock.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('search() populates results', async () => {
    searchUsersModMock.mockResolvedValue([SAMPLE_USER]);
    const { result } = renderHook(() => useModInvites());
    act(() => result.current.setQuery('Alice'));
    await act(async () => {
      await result.current.search();
    });
    expect(result.current.results).toEqual([SAMPLE_USER]);
  });

  it('selectUser() loads the user codes', async () => {
    listInviteCodesModMock.mockResolvedValue([]);
    const { result } = renderHook(() => useModInvites());
    await act(async () => {
      await result.current.selectUser(SAMPLE_USER);
    });
    expect(result.current.selected).toEqual(SAMPLE_USER);
    expect(listInviteCodesModMock).toHaveBeenCalledWith('u1');
    expect(result.current.codes).toEqual([]);
  });

  it('grant() calls API + reloads codes + sets toast', async () => {
    grantInviteCodeModMock.mockResolvedValue({ code: 'ABCD-1234', seat_cap: 3 });
    listInviteCodesModMock.mockResolvedValue([]);
    const { result } = renderHook(() => useModInvites());
    await act(async () => {
      await result.current.selectUser(SAMPLE_USER);
    });
    act(() => result.current.setSeatCap(3));
    await act(async () => {
      await result.current.grant();
    });
    expect(grantInviteCodeModMock).toHaveBeenCalledWith('u1', 3);
    await waitFor(() => expect(result.current.toast).toMatch(/granted ABCD-1234/i));
  });

  it('confirmRetire() calls API + clears pendingRetire', async () => {
    retireInviteCodeModMock.mockResolvedValue({ is_active: false });
    listInviteCodesModMock.mockResolvedValue([]);
    const { result } = renderHook(() => useModInvites());
    await act(async () => {
      await result.current.selectUser(SAMPLE_USER);
    });
    act(() => result.current.openRetire('code-1'));
    await act(async () => {
      await result.current.confirmRetire();
    });
    expect(retireInviteCodeModMock).toHaveBeenCalledWith('code-1');
    expect(result.current.pendingRetire).toBeNull();
  });
});
