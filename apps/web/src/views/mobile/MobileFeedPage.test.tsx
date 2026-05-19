import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileFeedPage } from './MobileFeedPage';
import { MobileLayout } from './MobileLayout';
import { makeFeedPost } from './__fixtures__/feedPost';

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const useNotificationsMock = vi.fn();
vi.mock('../../hooks/useNotifications', () => ({ useNotifications: () => useNotificationsMock() }));

const useFeedMock = vi.fn();
vi.mock('../../hooks/useFeed', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useFeed')>('../../hooks/useFeed');
  return { ...actual, useFeed: (opts?: unknown) => useFeedMock(opts) };
});

vi.mock('../../hooks/useFeedSnapshot', () => ({ useFeedSnapshot: () => {} }));

const usePrayerMock = vi.fn(() => ({ prayed: false, prayerCount: 0, toggle: vi.fn() }));
vi.mock('../../hooks/usePrayer', () => ({
  usePrayer: () => usePrayerMock(),
}));

const useReactionsMock = vi.fn(() => ({ reactions: {}, toggle: vi.fn() }));
vi.mock('../../hooks/useReactions', () => ({
  useReactions: () => useReactionsMock(),
}));

function renderAtUrl(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route element={<MobileLayout />}>
          <Route path="/" element={<MobileFeedPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('MobileFeedPage', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'sb' } },
      me: { id: 'me', email: 'm@t.local', displayName: 'Me', role: 'member' as const },
      loading: false,
      signOut: vi.fn(),
    });
    useNotificationsMock.mockReturnValue({
      items: [],
      loading: false,
      error: null,
      unreadCount: 0,
      fetchList: vi.fn(),
      markAllRead: vi.fn(),
      markRead: vi.fn(),
    });
    useFeedMock.mockReturnValue({
      posts: [makeFeedPost({ display_name: 'Alice', body: 'hi' })],
      pinned: [],
      filter: 'all',
      setFilter: vi.fn(),
      loading: false,
      error: null,
      hasMore: false,
      loadMore: vi.fn(),
      snapshotId: 's1',
      refresh: vi.fn(),
    });
  });
  afterEach(() => vi.clearAllMocks());

  it('renders posts via MobilePostCard', () => {
    renderAtUrl('/');
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
  });

  it('shows empty-state copy when no posts', () => {
    useFeedMock.mockReturnValue({
      posts: [],
      pinned: [],
      filter: 'all',
      setFilter: vi.fn(),
      loading: false,
      error: null,
      hasMore: false,
      loadMore: vi.fn(),
      snapshotId: 's1',
      refresh: vi.fn(),
    });
    renderAtUrl('/');
    expect(screen.getByText(/nothing on the wall yet/i)).toBeInTheDocument();
  });

  it('seeds filter from URL ?filter=mine via initialFilter', () => {
    renderAtUrl('/?filter=mine');
    expect(useFeedMock).toHaveBeenCalledWith({ initialFilter: 'mine' });
  });

  it('seeds filter as all when no ?filter= param present', () => {
    renderAtUrl('/');
    expect(useFeedMock).toHaveBeenCalledWith({ initialFilter: 'all' });
  });

  it('opens the drawer when hamburger is tapped', async () => {
    renderAtUrl('/');
    expect(screen.queryByRole('navigation', { name: /menu/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /menu/i }));
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: /menu/i })).toBeInTheDocument(),
    );
  });
});
