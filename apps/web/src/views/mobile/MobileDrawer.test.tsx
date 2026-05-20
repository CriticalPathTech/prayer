import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileDrawer } from './MobileDrawer';

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const baseAuth = {
  session: { user: { id: 'sb' } },
  me: { id: 'me', email: 'mary@test.local', displayName: 'Mary Donovan', role: 'member' as const },
  loading: false,
  signOut: vi.fn(),
};

describe('MobileDrawer', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue(baseAuth);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders user header with display name', () => {
    render(
      <MemoryRouter>
        <MobileDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Mary Donovan')).toBeInTheDocument();
  });

  it('hides the role badge for member', () => {
    render(
      <MemoryRouter>
        <MobileDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/moderator|super user/i)).not.toBeInTheDocument();
  });

  it('shows Moderator badge for moderator', () => {
    useAuthMock.mockReturnValue({
      ...baseAuth,
      me: { ...baseAuth.me, role: 'moderator' as const },
    });
    render(
      <MemoryRouter>
        <MobileDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Moderator')).toBeInTheDocument();
  });

  it('shows Super user badge for super_user', () => {
    useAuthMock.mockReturnValue({
      ...baseAuth,
      me: { ...baseAuth.me, role: 'super_user' as const },
    });
    render(
      <MemoryRouter>
        <MobileDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Super user')).toBeInTheDocument();
  });

  it('renders all 7 menu items + sign out', () => {
    render(
      <MemoryRouter>
        <MobileDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /all requests/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /my requests/i })).toHaveAttribute(
      'href',
      '/?filter=mine',
    );
    expect(screen.getByRole('link', { name: /answered prayers/i })).toHaveAttribute(
      'href',
      '/?filter=answered',
    );
    expect(screen.getByRole('link', { name: /archive/i })).toHaveAttribute('href', '/me/archive');
    expect(screen.getByRole('link', { name: /^profile$/i })).toHaveAttribute('href', '/me/profile');
    expect(screen.getByRole('link', { name: /^my invites$/i })).toHaveAttribute(
      'href',
      '/me/invites',
    );
    expect(screen.getByRole('link', { name: /security/i })).toHaveAttribute('href', '/me/security');
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('marks the active filter item via aria-current=page', () => {
    render(
      <MemoryRouter initialEntries={['/?filter=mine']}>
        <MobileDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /my requests/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /all requests/i })).not.toHaveAttribute('aria-current');
  });

  it('marks Archive active when on /me/archive', () => {
    render(
      <MemoryRouter initialEntries={['/me/archive']}>
        <MobileDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /archive/i })).toHaveAttribute('aria-current', 'page');
  });

  it('calls onClose when scrim is clicked', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <MobileDrawer onClose={onClose} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByTestId('mobile-drawer-scrim'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <MobileDrawer onClose={onClose} />
      </MemoryRouter>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking a menu item calls onClose (drawer dismisses on navigation)', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <MobileDrawer onClose={onClose} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('link', { name: /all requests/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Sign out triggers signOut from useAuth', async () => {
    const signOut = vi.fn();
    useAuthMock.mockReturnValue({ ...baseAuth, signOut });
    render(
      <MemoryRouter>
        <MobileDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(signOut).toHaveBeenCalled();
  });

  it('renders Account section with My invites (member); no moderation links', () => {
    render(
      <MemoryRouter>
        <MobileDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /^my invites$/i })).toHaveAttribute(
      'href',
      '/me/invites',
    );
    expect(screen.queryByRole('link', { name: /^review$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^reports$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^grant invites$/i })).not.toBeInTheDocument();
  });

  it('moderator without approval gate: Reports + Grant invites, no Review', () => {
    useAuthMock.mockReturnValue({
      ...baseAuth,
      me: { ...baseAuth.me, role: 'moderator' as const, orgRequiresPostApproval: false },
    });
    render(
      <MemoryRouter>
        <MobileDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: /^review$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^reports$/i })).toHaveAttribute('href', '/mod/queue');
    expect(screen.getByRole('link', { name: /^grant invites$/i })).toHaveAttribute(
      'href',
      '/mod/invites',
    );
  });

  it('moderator with approval gate: Review + Reports + Grant invites', () => {
    useAuthMock.mockReturnValue({
      ...baseAuth,
      me: { ...baseAuth.me, role: 'moderator' as const, orgRequiresPostApproval: true },
    });
    render(
      <MemoryRouter>
        <MobileDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /^review$/i })).toHaveAttribute(
      'href',
      '/mod/approvals',
    );
    expect(screen.getByRole('link', { name: /^reports$/i })).toHaveAttribute('href', '/mod/queue');
    expect(screen.getByRole('link', { name: /^grant invites$/i })).toHaveAttribute(
      'href',
      '/mod/invites',
    );
  });

  it('marks Reports active on /mod/queue and /mod/hidden', () => {
    useAuthMock.mockReturnValue({
      ...baseAuth,
      me: { ...baseAuth.me, role: 'moderator' as const },
    });
    const { unmount } = render(
      <MemoryRouter initialEntries={['/mod/queue']}>
        <MobileDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /^reports$/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    unmount();
    render(
      <MemoryRouter initialEntries={['/mod/hidden']}>
        <MobileDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /^reports$/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows the mod links for super_user as well', () => {
    useAuthMock.mockReturnValue({
      ...baseAuth,
      me: { ...baseAuth.me, role: 'super_user' as const },
    });
    render(
      <MemoryRouter>
        <MobileDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /^reports$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^grant invites$/i })).toBeInTheDocument();
  });
});
