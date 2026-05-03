import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ModInvitesPage } from './ModInvitesPage';

const useAuthMock = vi.fn();
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../lib/api', () => ({
  searchUsersMod: vi.fn(),
  grantInviteCodeMod: vi.fn(),
  listInviteCodesMod: vi.fn(),
  retireInviteCodeMod: vi.fn(),
}));

const api = await import('../lib/api');

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/mod/invites']}>
      <ModInvitesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({
    me: { id: 'm1', display_name: 'mod', role: 'moderator' },
    loading: false,
    needsOnboarding: false,
    session: { user: { id: 'x' } },
  });
});

describe('ModInvitesPage', () => {
  it('grants a new code and shows a success toast', async () => {
    vi.mocked(api.searchUsersMod).mockResolvedValueOnce([
      { id: 'u1', display_name: 'Ben', email: 'ben@e.com' },
    ] as never);
    vi.mocked(api.listInviteCodesMod).mockResolvedValue([] as never);
    vi.mocked(api.grantInviteCodeMod).mockResolvedValueOnce({
      id: 'c1',
      code: 'newco',
      seat_cap: 5,
      seats_remaining: 5,
      is_active: true,
      created_at: '',
    } as never);

    renderPage();
    await userEvent.type(screen.getByLabelText(/member/i), 'b');
    await waitFor(() => expect(screen.getByText(/Ben/)).toBeInTheDocument());
    await userEvent.click(screen.getByText(/Ben/));
    await userEvent.clear(screen.getByLabelText(/seats/i));
    await userEvent.type(screen.getByLabelText(/seats/i), '5');
    await userEvent.click(screen.getByRole('button', { name: /grant code/i }));
    await waitFor(() =>
      expect(screen.getByText(/Granted newco with 5 seats to Ben/)).toBeInTheDocument(),
    );
    expect(vi.mocked(api.grantInviteCodeMod)).toHaveBeenCalledWith('u1', 5);
  });

  it('retire button opens a confirm modal and calls the API on confirm', async () => {
    vi.mocked(api.searchUsersMod).mockResolvedValueOnce([
      { id: 'u1', display_name: 'Ben', email: 'ben@e.com' },
    ] as never);
    vi.mocked(api.listInviteCodesMod).mockResolvedValueOnce([
      {
        id: 'c1',
        code: 'de32s',
        seat_cap: 3,
        seats_remaining: 2,
        is_active: true,
        created_at: '',
        redemptions: [],
      },
    ] as never);
    vi.mocked(api.listInviteCodesMod).mockResolvedValueOnce([] as never);
    vi.mocked(api.retireInviteCodeMod).mockResolvedValueOnce({ is_active: false } as never);

    renderPage();
    await userEvent.type(screen.getByLabelText(/member/i), 'b');
    await waitFor(() => screen.getByText(/Ben/));
    await userEvent.click(screen.getByText(/Ben/));
    await waitFor(() => screen.getByText('de32s'));
    await userEvent.click(screen.getByRole('button', { name: /retire/i }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^retire$/i }));
    await waitFor(() => expect(vi.mocked(api.retireInviteCodeMod)).toHaveBeenCalledWith('c1'));
  });

  it('redirects non-moderators', () => {
    useAuthMock.mockReturnValueOnce({
      me: { id: 'm1', display_name: 'member', role: 'member' },
      loading: false,
      needsOnboarding: false,
      session: { user: { id: 'x' } },
    });
    renderPage();
    // Navigate re-renders; the h1 should not be present
    expect(screen.queryByText(/^Invites$/)).not.toBeInTheDocument();
  });
});
