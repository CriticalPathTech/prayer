import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MeProfileRedirect, MeSecurityRedirect } from '../App';

import { MemberProfilePage } from './MemberProfilePage';

const apiFetchMock = vi.fn();
vi.mock('../lib/api', () => ({
  apiFetch: (path: string) => apiFetchMock(path),
}));

const useAuthMock = vi.fn();
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

// Isolate the embedded settings/security pages — they each do their own data
// fetching which would interfere with the apiFetchMock sequencing. Verifying
// the correct tab content lives inside MemberProfilePage.test.tsx; here we
// just need to assert the redirect landed on the right tab.
vi.mock('./ProfilePage', () => ({
  ProfilePage: () => <div data-testid="profile-page-mock">settings-mock</div>,
}));
vi.mock('./SecurityPage', () => ({
  SecurityPage: () => <div data-testid="security-page-mock">security-mock</div>,
}));

function mockUser(): void {
  apiFetchMock.mockImplementation((path: string | undefined) => {
    if (typeof path === 'string' && (path.includes('/posts?') || path.endsWith('/posts'))) {
      return Promise.resolve({ posts: [], nextCursor: null, snapshotId: '' });
    }
    return Promise.resolve({
      id: 'me-id',
      display_name: 'Me',
      avatar_url: null,
      role: 'member',
    });
  });
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/me/profile" element={<MeProfileRedirect />} />
        <Route path="/me/security" element={<MeSecurityRedirect />} />
        <Route path="/u/:userId" element={<MemberProfilePage />} />
        <Route path="/" element={<div data-testid="home">home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('/me/profile and /me/security redirects', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({
      me: { id: 'me-id', displayName: 'Me', role: 'member', avatarUrl: null },
    });
  });

  it('/me/profile redirects to /u/{me.id}?tab=settings with Settings tab selected', async () => {
    mockUser();
    renderAt('/me/profile');
    await waitFor(() => {
      const t = screen.getByRole('tab', { name: /settings/i });
      expect(t.getAttribute('aria-selected')).toBe('true');
    });
    expect(screen.getByTestId('profile-page-mock')).toBeInTheDocument();
  });

  it('/me/security redirects to /u/{me.id}?tab=security with Security tab selected', async () => {
    mockUser();
    renderAt('/me/security');
    await waitFor(() => {
      const t = screen.getByRole('tab', { name: /security/i });
      expect(t.getAttribute('aria-selected')).toBe('true');
    });
    expect(screen.getByTestId('security-page-mock')).toBeInTheDocument();
  });

  it('/me/profile sends unauthenticated visitors to "/"', () => {
    useAuthMock.mockReturnValue({ me: null });
    renderAt('/me/profile');
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  it('/me/security sends unauthenticated visitors to "/"', () => {
    useAuthMock.mockReturnValue({ me: null });
    renderAt('/me/security');
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });
});
