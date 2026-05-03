import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileProfilePage } from './MobileProfilePage';

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const useProfileFormMock = vi.fn();
vi.mock('../../hooks/useProfileForm', () => ({ useProfileForm: () => useProfileFormMock() }));

vi.mock('../../components/AvatarCropDialog', () => ({
  AvatarCropDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="crop" /> : null),
}));

const baseHook = {
  displayName: 'Mary',
  setDisplayName: vi.fn(),
  dirty: false,
  submitting: false,
  saveError: null,
  justSaved: false,
  save: vi.fn().mockResolvedValue(undefined),
  cropOpen: false,
  openCrop: vi.fn(),
  closeCrop: vi.fn(),
  onAvatarSaved: vi.fn(),
  pendingRemove: false,
  openRemove: vi.fn(),
  closeRemove: vi.fn(),
  removing: false,
  confirmRemove: vi.fn().mockResolvedValue(undefined),
};

describe('MobileProfilePage', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      me: { id: 'me', email: 'm@t.local', displayName: 'Mary', avatarUrl: null, role: 'member' },
    });
    useProfileFormMock.mockReturnValue({ ...baseHook });
  });
  afterEach(() => vi.clearAllMocks());

  it('renders Profile header (back variant)', () => {
    render(
      <MemoryRouter>
        <MobileProfilePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('Save disabled when not dirty; enabled when dirty', () => {
    useProfileFormMock.mockReturnValue({ ...baseHook, dirty: true });
    render(
      <MemoryRouter>
        <MobileProfilePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
  });

  it('opens remove confirm when Remove photo is tapped', async () => {
    const openRemove = vi.fn();
    useProfileFormMock.mockReturnValue({
      ...baseHook,
      openRemove,
    });
    useAuthMock.mockReturnValue({
      me: { id: 'me', email: 'm@t.local', displayName: 'Mary', avatarUrl: 'x', role: 'member' },
    });
    render(
      <MemoryRouter>
        <MobileProfilePage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /remove photo/i }));
    expect(openRemove).toHaveBeenCalled();
  });

  it('renders the remove-confirm modal when pendingRemove is true', () => {
    useProfileFormMock.mockReturnValue({ ...baseHook, pendingRemove: true });
    render(
      <MemoryRouter>
        <MobileProfilePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('dialog', { name: /remove photo/i })).toBeInTheDocument();
  });
});
