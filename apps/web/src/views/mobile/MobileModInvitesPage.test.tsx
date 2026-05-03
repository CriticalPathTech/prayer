import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileModInvitesPage } from './MobileModInvitesPage';

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const useModInvitesMock = vi.fn();
vi.mock('../../hooks/useModInvites', () => ({ useModInvites: () => useModInvitesMock() }));

const baseHook = {
  query: '',
  setQuery: vi.fn(),
  results: [],
  search: vi.fn().mockResolvedValue(undefined),
  selected: null as { id: string; display_name: string; email: string } | null,
  selectUser: vi.fn().mockResolvedValue(undefined),
  codes: [],
  seatCap: 3,
  setSeatCap: vi.fn(),
  grant: vi.fn().mockResolvedValue(undefined),
  pendingRetire: null as string | null,
  openRetire: vi.fn(),
  closeRetire: vi.fn(),
  confirmRetire: vi.fn().mockResolvedValue(undefined),
  toast: null as string | null,
  error: null as string | null,
};

describe('MobileModInvitesPage', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      me: { id: 'me', email: 'm@t.local', displayName: 'Mod', avatarUrl: null, role: 'moderator' },
    });
    useModInvitesMock.mockReturnValue({ ...baseHook });
  });
  afterEach(() => vi.clearAllMocks());

  it('redirects non-mods', () => {
    useAuthMock.mockReturnValue({
      me: { id: 'me', email: 'm@t.local', displayName: 'Mary', avatarUrl: null, role: 'member' },
    });
    render(
      <MemoryRouter initialEntries={['/mod/invites']}>
        <MobileModInvitesPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Grant invites')).not.toBeInTheDocument();
  });

  it('renders Grant invites header + search field', () => {
    render(
      <MemoryRouter>
        <MobileModInvitesPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Grant invites')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search by name or email/i)).toBeInTheDocument();
  });

  it('shows results and selecting a user calls selectUser', async () => {
    const selectUser = vi.fn().mockResolvedValue(undefined);
    useModInvitesMock.mockReturnValue({
      ...baseHook,
      results: [{ id: 'u1', display_name: 'Alice', email: 'a@t.local' }],
      selectUser,
    });
    render(
      <MemoryRouter>
        <MobileModInvitesPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Alice/ }));
    expect(selectUser).toHaveBeenCalled();
  });

  it('Grant code button is disabled until a user is selected', () => {
    render(
      <MemoryRouter>
        <MobileModInvitesPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /grant code/i })).toBeDisabled();
  });

  it('shows toast from hook', () => {
    useModInvitesMock.mockReturnValue({ ...baseHook, toast: 'Granted ABCD-1234.' });
    render(
      <MemoryRouter>
        <MobileModInvitesPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/granted abcd-1234/i)).toBeInTheDocument();
  });

  it('shows retire confirm modal when pendingRetire is set', () => {
    useModInvitesMock.mockReturnValue({
      ...baseHook,
      selected: { id: 'u1', display_name: 'Alice', email: 'a@t.local' },
      pendingRetire: 'code-1',
    });
    render(
      <MemoryRouter>
        <MobileModInvitesPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('dialog', { name: /confirm retire code/i })).toBeInTheDocument();
  });
});
