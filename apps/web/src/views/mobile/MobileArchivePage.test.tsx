import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileArchivePage } from './MobileArchivePage';
import { makeFeedPost } from './__fixtures__/feedPost';

const apiFetchMock = vi.fn();
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const usePrayerMock = vi.fn(() => ({ prayed: false, prayerCount: 0, toggle: vi.fn() }));
vi.mock('../../hooks/usePrayer', () => ({ usePrayer: () => usePrayerMock() }));

const useReactionsMock = vi.fn(() => ({ reactions: {}, toggle: vi.fn() }));
vi.mock('../../hooks/useReactions', () => ({ useReactions: () => useReactionsMock() }));

describe('MobileArchivePage', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'sb' } },
      me: { id: 'me', email: 'm@t.local', displayName: 'Me', role: 'member' as const },
      loading: false,
      signOut: vi.fn(),
    });
  });
  afterEach(() => {
    apiFetchMock.mockReset();
  });

  it('fetches /posts/me/archive on mount and renders posts', async () => {
    apiFetchMock.mockResolvedValue({
      posts: [makeFeedPost({ display_name: 'Past', body: 'old prayer' })],
    });
    render(
      <MemoryRouter>
        <MobileArchivePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('old prayer')).toBeInTheDocument());
    expect(apiFetchMock).toHaveBeenCalledWith('/posts/me/archive');
  });

  it('shows empty-state copy when no archived posts', async () => {
    apiFetchMock.mockResolvedValue({ posts: [] });
    render(
      <MemoryRouter>
        <MobileArchivePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/your archive is empty/i)).toBeInTheDocument());
  });

  it('renders an Archive header (back variant)', async () => {
    apiFetchMock.mockResolvedValue({ posts: [] });
    render(
      <MemoryRouter>
        <MobileArchivePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('shows error message on fetch failure', async () => {
    apiFetchMock.mockRejectedValue(new Error('boom'));
    render(
      <MemoryRouter>
        <MobileArchivePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument());
  });
});
