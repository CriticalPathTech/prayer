import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemberProfilePage } from './MemberProfilePage';

const apiFetchMock = vi.fn();
vi.mock('../lib/api', () => ({
  apiFetch: (path: string) => apiFetchMock(path),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    me: { id: 'me-id', displayName: 'Me', role: 'member', avatarUrl: null },
  }),
}));

// Isolate the embedded settings/security pages — they each do their own
// data fetching which would interfere with the apiFetchMock sequencing.
vi.mock('./ProfilePage', () => ({
  ProfilePage: () => <div data-testid="profile-page-mock">settings-mock</div>,
}));
vi.mock('./SecurityPage', () => ({
  SecurityPage: () => <div data-testid="security-page-mock">security-mock</div>,
}));

interface UserFixture {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: 'member' | 'moderator' | 'super_user';
}

/** Route apiFetch calls by URL: /users/:id → user dto, /users/:id/posts → list.
 * This is order-independent — useEffect fires for both header + posts hook on
 * mount, and the order isn't guaranteed. */
function mockBy(
  user: UserFixture,
  postsResp: { posts: unknown[]; nextCursor: string | null },
): void {
  apiFetchMock.mockImplementation((path: string | undefined) => {
    if (typeof path === 'string' && (path.includes('/posts?') || path.endsWith('/posts'))) {
      return Promise.resolve({ ...postsResp, snapshotId: '' });
    }
    return Promise.resolve(user);
  });
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/u/:userId" element={<MemberProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MemberProfilePage', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('renders target header for other viewer with no tabs', async () => {
    mockBy(
      { id: 'u1', display_name: 'Alice', avatar_url: null, role: 'member' },
      { posts: [], nextCursor: null },
    );
    renderAt('/u/u1');
    await screen.findByText('Alice');
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('renders role badge for moderator', async () => {
    mockBy(
      { id: 'u1', display_name: 'Mod', avatar_url: null, role: 'moderator' },
      { posts: [], nextCursor: null },
    );
    renderAt('/u/u1');
    await screen.findByText('Moderator');
  });

  it('renders three tabs for self viewer', async () => {
    mockBy(
      { id: 'me-id', display_name: 'Me', avatar_url: null, role: 'member' },
      { posts: [], nextCursor: null },
    );
    renderAt('/u/me-id');
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(3));
  });

  it('shows empty-state copy for self with 0 posts', async () => {
    mockBy(
      { id: 'me-id', display_name: 'Me', avatar_url: null, role: 'member' },
      { posts: [], nextCursor: null },
    );
    renderAt('/u/me-id');
    await screen.findByText(/you haven't posted any prayer requests yet/i);
  });

  it('shows empty-state copy for other with 0 posts', async () => {
    mockBy(
      { id: 'u1', display_name: 'Alice', avatar_url: null, role: 'member' },
      { posts: [], nextCursor: null },
    );
    renderAt('/u/u1');
    await screen.findByText(/alice hasn't posted any prayer requests yet/i);
  });

  it('?tab=settings selects Settings tab', async () => {
    mockBy(
      { id: 'me-id', display_name: 'Me', avatar_url: null, role: 'member' },
      { posts: [], nextCursor: null },
    );
    renderAt('/u/me-id?tab=settings');
    await waitFor(() => {
      const t = screen.getByRole('tab', { name: /settings/i });
      expect(t.getAttribute('aria-selected')).toBe('true');
    });
    expect(screen.getByTestId('profile-page-mock')).toBeInTheDocument();
  });
});
