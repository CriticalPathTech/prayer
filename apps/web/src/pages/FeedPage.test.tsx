import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeedPage } from './FeedPage';

type AuthReturn = {
  session: { user: { id: string } } | null;
  me: {
    id: string;
    email: string;
    displayName: string;
    role: 'member' | 'moderator' | 'super_user';
  } | null;
  loading: boolean;
  signOut: () => void;
};

const useAuthMock: ReturnType<typeof vi.fn<() => AuthReturn>> = vi.fn(() => ({
  session: { user: { id: 'supabase-me' } },
  me: { id: 'me', email: 'me@test.local', displayName: 'Me', role: 'member' as const },
  loading: false,
  signOut: vi.fn(),
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

const feedFetch = vi.fn();
const snapshotFetch = vi.fn();

// Route /feed/snapshot calls to snapshotFetch and all other /feed calls to
// feedFetch so tests can control them independently without positional ordering
// issues caused by useFeedSnapshot polling immediately on mount.
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    apiFetch: (url: string) => (url === '/feed/snapshot' ? snapshotFetch(url) : feedFetch(url)),
  };
});

const post = (over: Record<string, unknown> = {}) => ({
  id: '018f0000-0000-7000-8000-000000000001',
  author_id: 'u1',
  display_name: 'Alice',
  avatar_url: null,
  status: 'published',
  is_anonymous: false,
  is_answered_prayer: false,
  body: 'Please pray',
  reaction_count: 0,
  prayer_count: 0,
  answered_updates: [],
  parent_id: null,
  expires_at: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
  edit_deadline: new Date(Date.now() + 3600_000).toISOString(),
  created_at: new Date().toISOString(),
  prayed: false,
  reactions: {},
  is_own_post: false,
  hidden_by: null,
  hidden_source: null,
  ...over,
});

describe('FeedPage', () => {
  beforeEach(() => {
    // Default: snapshot polls return 's1' (no new activity) so existing tests
    // are unaffected by useFeedSnapshot polling immediately on mount.
    snapshotFetch.mockResolvedValue({ snapshotId: 's1' });
  });
  afterEach(() => {
    feedFetch.mockReset();
    snapshotFetch.mockReset();
  });

  it('renders posts from the feed', async () => {
    feedFetch.mockResolvedValueOnce({
      posts: [post({ body: 'Hi there' })],
      nextCursor: null,
      snapshotId: 's1',
    });
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Hi there')).toBeInTheDocument();
  });

  it('shows Anonymous when author_id is null', async () => {
    feedFetch.mockResolvedValueOnce({
      posts: [post({ author_id: null, display_name: null, is_anonymous: true })],
      nextCursor: null,
      snapshotId: 's1',
    });
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/anonymous/i)).toBeInTheDocument();
  });

  it('switching filter tab refetches', async () => {
    feedFetch.mockResolvedValueOnce({ posts: [], nextCursor: null, snapshotId: 's1' });
    feedFetch.mockResolvedValueOnce({
      posts: [post({ body: 'popular!' })],
      nextCursor: null,
      snapshotId: 's1',
    });
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(feedFetch).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('tab', { name: /my requests/i }));
    expect(await screen.findByText('popular!')).toBeInTheDocument();
    expect(feedFetch.mock.calls[1]![0]).toContain('filter=mine');
  });

  it('load more advances the cursor', async () => {
    feedFetch.mockResolvedValueOnce({
      posts: [post({ id: 'p1', body: 'first' })],
      nextCursor: 'abc',
      snapshotId: 's1',
    });
    feedFetch.mockResolvedValueOnce({
      posts: [post({ id: 'p2', body: 'second' })],
      nextCursor: null,
      snapshotId: 's1',
    });
    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('first')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /load more/i }));
    expect(await screen.findByText('second')).toBeInTheDocument();
    expect(feedFetch.mock.calls[1]![0]).toContain('cursor=abc');
  });

  it('shows NewActivityBanner when remote snapshotId differs, and refreshes on click', async () => {
    // 1st feedFetch call: /feed mount — snapshotId 's1', empty list
    // snapshotFetch call: /feed/snapshot polled — returns 's2' (new activity)
    // 2nd feedFetch call: /feed refresh — returns snapshotId 's2' and a new post
    feedFetch
      .mockResolvedValueOnce({ posts: [], nextCursor: null, snapshotId: 's1' })
      .mockResolvedValueOnce({
        posts: [post({ id: 'p-new', body: 'new one!' })],
        nextCursor: null,
        snapshotId: 's2',
      });
    snapshotFetch.mockResolvedValue({ snapshotId: 's2' });

    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(feedFetch).toHaveBeenCalledWith('/feed?filter=all'));
    // poll fires → banner appears
    await waitFor(() => expect(snapshotFetch).toHaveBeenCalledWith('/feed/snapshot'));
    await screen.findByRole('button', { name: /new activity/i });
    // click → refresh
    await userEvent.click(screen.getByRole('button', { name: /new activity/i }));
    expect(await screen.findByText('new one!')).toBeInTheDocument();
  });
});
