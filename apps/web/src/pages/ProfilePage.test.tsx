import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfilePage } from './ProfilePage';

const useAuthMock = vi.fn();
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock('../lib/api', () => ({
  updateMyProfile: vi.fn(),
  uploadMyAvatar: vi.fn(),
  deleteMyAvatar: vi.fn(),
}));
vi.mock('../components/AvatarCropDialog', () => ({
  AvatarCropDialog: ({ open }: { open: boolean }) =>
    open ? (
      <div role="dialog" aria-label="Change photo">
        crop
      </div>
    ) : null,
}));
const api = await import('../lib/api');

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({
    me: { id: 'u1', email: 'alice@e.com', displayName: 'Alice', avatarUrl: null, role: 'member' },
    refreshMe: vi.fn().mockResolvedValue(undefined),
  });
});

describe('ProfilePage', () => {
  it('prefills the display_name from useAuth().me', () => {
    renderPage();
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Alice');
  });

  it('disables Save when the name is unchanged', () => {
    renderPage();
    const btn = screen.getByRole('button', { name: /save/i });
    expect(btn).toBeDisabled();
  });

  it('calls PATCH /me and refreshMe on save', async () => {
    vi.mocked(api.updateMyProfile).mockResolvedValueOnce({
      id: 'u1',
      email: 'alice@e.com',
      display_name: 'Alice K.',
      role: 'member',
    } as never);
    renderPage();
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), 'Alice K.');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(api.updateMyProfile).toHaveBeenCalledWith({ display_name: 'Alice K.' }),
    );
    const auth = useAuthMock.mock.results.at(-1)!.value;
    await waitFor(() => expect(auth.refreshMe).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeInTheDocument());
  });

  it('shows validation error inline on 400', async () => {
    vi.mocked(api.updateMyProfile).mockRejectedValueOnce({
      code: 'VALIDATION_ERROR',
      message: "Name can't be empty.",
    });
    renderPage();
    await userEvent.clear(screen.getByLabelText(/display name/i));
    await userEvent.type(screen.getByLabelText(/display name/i), '<>');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(screen.getByText(/please check your input/i)).toBeInTheDocument());
  });

  it('opens AvatarCropDialog on Change photo click', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /change photo/i }));
    expect(screen.getByRole('dialog', { name: /change photo/i })).toBeInTheDocument();
  });

  it('disables Remove photo when no avatar is set', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /remove photo/i })).toBeDisabled();
  });

  it('calls deleteMyAvatar after confirming Remove photo', async () => {
    useAuthMock.mockReturnValue({
      me: {
        id: 'u1',
        email: 'a@e.com',
        displayName: 'A',
        avatarUrl: 'https://x/y',
        role: 'member',
      },
      refreshMe: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(api.deleteMyAvatar).mockResolvedValueOnce({
      id: 'u1',
      email: 'a@e.com',
      display_name: 'A',
      avatar_url: null,
      role: 'member',
    } as never);
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /remove photo/i }));
    const dialog = await screen.findByRole('dialog', { name: /remove photo/i });
    await userEvent.click(within(dialog).getByRole('button', { name: /^remove$/i }));
    await waitFor(() => expect(api.deleteMyAvatar).toHaveBeenCalled());
  });
});
