import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Layout } from './Layout';

const useAuthMock = vi.fn();
vi.mock('../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const useNotificationsMock = vi.fn();
vi.mock('../hooks/useNotifications', () => ({ useNotifications: () => useNotificationsMock() }));

const baseAuth = {
  session: { user: { id: 'sb-user-id' } },
  me: {
    id: 'me-id',
    email: 'alice@test.local',
    displayName: 'Alice',
    role: 'member' as const,
    orgDisplayName: 'Hope Church',
    avatarUrl: null,
  },
  loading: false,
  signOut: vi.fn(),
};

const baseNotif = {
  unreadCount: 0,
  items: [],
  loading: false,
  error: null,
  fetchList: vi.fn(),
  markAllRead: vi.fn(),
  markRead: vi.fn(),
};

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<div>feed</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout avatar dropdown', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue(baseAuth);
    useNotificationsMock.mockReturnValue(baseNotif);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens the account menu when the avatar button is clicked', async () => {
    renderLayout();
    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /account menu for alice/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('avatar dropdown shows "My profile" and "Sign out"; no Security entry', async () => {
    renderLayout();
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('menuitem', { name: /my profile/i })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeDefined();
    expect(screen.queryByRole('menuitem', { name: /^security$/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /^profile$/i })).toBeNull();
  });

  it('"My profile" link points at /u/:meId', async () => {
    renderLayout();
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    const link = screen.getByRole('menuitem', { name: /my profile/i });
    expect(link.getAttribute('href')).toBe('/u/me-id');
  });

  it('clicking "Sign out" calls signOut from useAuth', async () => {
    const signOut = vi.fn();
    useAuthMock.mockReturnValue({ ...baseAuth, signOut });
    renderLayout();
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));
    expect(signOut).toHaveBeenCalled();
  });

  it('dropdown also contains Archive and Invites entries', async () => {
    renderLayout();
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('menuitem', { name: /archive/i })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: /invites/i })).toBeDefined();
  });
});
