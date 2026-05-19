import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../lib/api';

import { PostDetailPage } from './PostDetailPage';

const postFetch = vi.fn();
const commentsFetch = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    apiFetch: (url: string, init?: RequestInit) => {
      if (url.includes('/comments')) return commentsFetch(url, init);
      return postFetch(url, init);
    },
  };
});

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

// Default: authenticated as app user "me"
const useAuthMock: ReturnType<typeof vi.fn<() => AuthReturn>> = vi.fn(() => ({
  session: { user: { id: 'supabase-me' } },
  me: { id: 'me', email: 'me@test.local', displayName: 'Me', role: 'member' as const },
  loading: false,
  signOut: vi.fn(),
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

const basePost = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  author_id: 'u1',
  display_name: 'Alice',
  avatar_url: null,
  status: 'published',
  is_anonymous: false,
  is_answered_prayer: false,
  body: 'Please pray',
  reaction_count: 0,
  prayer_count: 0,
  updates: [],
  parent_id: null,
  expires_at: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
  edit_deadline: new Date(Date.now() + 3600_000).toISOString(),
  created_at: new Date().toISOString(),
  pinned_at: null,
  pinned_by: null,
  prayed: false,
  reactions: {},
  is_own_post: false,
  hidden_by: null,
  hidden_source: null,
  ...over,
});

const baseDetail = (postOver: Record<string, unknown> = {}, updates: unknown[] = []) => ({
  post: basePost(postOver),
  updates,
  reactions: {},
  prayer: { prayer_count: 0, prayed: false },
});

const renderAt = (postId: string) =>
  render(
    <MemoryRouter initialEntries={[`/posts/${postId}`]}>
      <Routes>
        <Route path="/posts/:id" element={<PostDetailPage />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('PostDetailPage', () => {
  beforeEach(() => {
    commentsFetch.mockResolvedValue({ threads: [] });
  });

  afterEach(() => {
    postFetch.mockReset();
    commentsFetch.mockReset();
  });

  it('renders post + updates', async () => {
    postFetch.mockResolvedValueOnce(
      baseDetail({}, [
        basePost({ id: 'u1', parent_id: 'p1', body: 'answered!', is_answered_prayer: true }),
      ]),
    );
    renderAt('p1');
    expect(await screen.findByText('Please pray')).toBeInTheDocument();
    expect(screen.getByText('answered!')).toBeInTheDocument();
  });

  it('renders Prayer answered ribbon when post.is_answered_prayer is true', async () => {
    postFetch.mockResolvedValueOnce(baseDetail({ is_answered_prayer: true }));
    renderAt('p1');
    expect(await screen.findByText('Prayer answered')).toBeInTheDocument();
  });

  it('shows Edit in the kebab menu only within edit_deadline for author', async () => {
    postFetch.mockResolvedValueOnce(
      baseDetail({
        author_id: 'me',
        is_own_post: true,
        edit_deadline: new Date(Date.now() + 3600_000).toISOString(),
      }),
    );
    renderAt('p1');
    await userEvent.click(await screen.findByRole('button', { name: /more actions/i }));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
  });

  it('shows the kebab menu in the article header', async () => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-me' } },
      me: { id: 'me', email: 'me@test.local', displayName: 'Me', role: 'member' as const },
      loading: false,
      signOut: vi.fn(),
    });
    postFetch.mockResolvedValueOnce(
      baseDetail({
        author_id: 'me',
        is_own_post: true,
        status: 'published',
        edit_deadline: new Date(Date.now() + 3600_000).toISOString(),
      }),
    );
    renderAt('p1');
    expect(await screen.findByRole('button', { name: /more actions/i })).toBeInTheDocument();
  });

  it('shows 404 on ApiError 404', async () => {
    postFetch.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'gone'));
    renderAt('p1');
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });

  it('renders Comments section with Moderator view badge for moderators', async () => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-mod' } },
      me: { id: 'mod', email: 'mod@test.local', displayName: 'Mod', role: 'moderator' as const },
      loading: false,
      signOut: vi.fn(),
    });
    postFetch.mockResolvedValueOnce(baseDetail());
    commentsFetch.mockResolvedValueOnce({ threads: [] });
    renderAt('p1');
    await screen.findByText('Please pray');
    expect(screen.getByText(/moderator view/i)).toBeInTheDocument();
  });

  it('renders existing threads and allows posting into a new thread', async () => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-x' } },
      me: { id: 'x', email: 'x@test.local', displayName: 'X', role: 'member' as const },
      loading: false,
      signOut: vi.fn(),
    });
    postFetch.mockResolvedValueOnce(baseDetail());
    commentsFetch
      .mockResolvedValueOnce({ threads: [] }) // initial
      .mockResolvedValueOnce({ comment: { id: 'c1' } }) // POST
      .mockResolvedValueOnce({
        threads: [
          {
            participant_id: 'x',
            participant_display_name: 'X',
            comments: [
              {
                id: 'c1',
                post_id: 'p1',
                author_id: 'x',
                display_name: 'X',
                avatar_url: null,
                is_anonymous_author: false,
                participant_id: 'x',
                body: 'Praying',
                reaction_count: 0,
                is_hidden: false,
                flag_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                reactions: {},
              },
            ],
          },
        ],
      });
    renderAt('p1');
    await screen.findByText('Please pray');
    const textarea = await screen.findByLabelText(/your comment/i);
    await userEvent.type(textarea, 'Praying');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(await screen.findByText('Praying')).toBeInTheDocument();
  });

  it('moderator sees a Comment button in every thread and a post-level new-thread composer', async () => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-mod' } },
      me: { id: 'mod', email: 'mod@test.local', displayName: 'Mod', role: 'moderator' as const },
      loading: false,
      signOut: vi.fn(),
    });
    postFetch.mockResolvedValueOnce(baseDetail());
    commentsFetch.mockResolvedValueOnce({
      threads: [
        {
          participant_id: 'member1',
          participant_display_name: 'Member One',
          comments: [
            {
              id: 'c-member1',
              post_id: 'p1',
              author_id: 'member1',
              display_name: 'Member One',
              avatar_url: null,
              is_anonymous_author: false,
              participant_id: 'member1',
              body: 'member1 message',
              reaction_count: 0,
              is_hidden: false,
              flag_count: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              reactions: {},
            },
          ],
        },
      ],
    });
    renderAt('p1');
    await screen.findByText('member1 message');

    // Moderator starts with a Comment button (collapsed composer) inside member1's thread
    const commentBtn = await screen.findByRole('button', { name: /^comment$/i });
    expect(commentBtn).toBeInTheDocument();
    // No inline textarea until Comment is clicked
    expect(screen.queryByRole('button', { name: /^reply$/i })).not.toBeInTheDocument();

    await userEvent.click(commentBtn);
    // Now the composer is expanded
    expect(screen.getByRole('button', { name: /^reply$/i })).toBeInTheDocument();

    // Moderator also has a post-level composer to start their own thread
    expect(screen.getByLabelText(/your comment/i)).toBeInTheDocument();
    expect(screen.getByText(/start your own private thread with the author/i)).toBeInTheDocument();
  });
});
