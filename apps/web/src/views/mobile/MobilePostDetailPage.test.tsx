import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobilePostDetailPage } from './MobilePostDetailPage';

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const usePostMock = vi.fn();
vi.mock('../../hooks/usePost', () => ({ usePost: () => usePostMock() }));

const usePostCommentsMock = vi.fn();
vi.mock('../../hooks/usePostComments', () => ({ usePostComments: () => usePostCommentsMock() }));

const usePrayerMock = vi.fn(() => ({ prayed: false, prayerCount: 0, toggle: vi.fn() }));
vi.mock('../../hooks/usePrayer', () => ({ usePrayer: () => usePrayerMock() }));

const useReactionsMock = vi.fn(() => ({ reactions: {}, toggle: vi.fn() }));
vi.mock('../../hooks/useReactions', () => ({ useReactions: () => useReactionsMock() }));

const farFuture = new Date(Date.now() + 30 * 60_000).toISOString();

function basePost(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    parent_id: null,
    author_id: 'author-1',
    display_name: 'Mary',
    avatar_url: null,
    status: 'published' as const,
    is_anonymous: false,
    is_answered_prayer: false,
    body: 'Please pray.',
    reaction_count: 0,
    prayer_count: 0,
    expires_at: null,
    edit_deadline: farFuture,
    created_at: new Date().toISOString(),
    pinned_at: null,
    pinned_by: null,
    is_own_post: false,
    hidden_by: null,
    hidden_source: null,
    prayed: false,
    reactions: {},
    updates: [],
    ...over,
  };
}

function makeComment(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    post_id: 'p1',
    author_id: 'a',
    participant_id: 'u1',
    display_name: 'Alice',
    avatar_url: null,
    body: 'praying',
    is_hidden: false,
    is_anonymous_author: false,
    reaction_count: 0,
    flag_count: 0,
    reactions: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
}

function renderAt(url = '/posts/p1') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/posts/:id" element={<MobilePostDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MobilePostDetailPage', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'sb' } },
      me: { id: 'me', email: 'm@t.local', displayName: 'Me', role: 'member' as const },
      loading: false,
      signOut: vi.fn(),
    });
    usePostCommentsMock.mockReturnValue({
      threads: [],
      loading: false,
      error: null,
      reload: vi.fn(),
      addComment: vi.fn(),
      editComment: vi.fn(),
      deleteComment: vi.fn(),
    });
  });
  afterEach(() => vi.clearAllMocks());

  it('shows loading state', () => {
    usePostMock.mockReturnValue({
      data: null,
      loading: true,
      notFound: false,
      error: null,
      reload: vi.fn(),
    });
    renderAt();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows not-found state', () => {
    usePostMock.mockReturnValue({
      data: null,
      loading: false,
      notFound: true,
      error: null,
      reload: vi.fn(),
    });
    renderAt();
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });

  it('renders the parent post body', () => {
    usePostMock.mockReturnValue({
      data: {
        post: basePost({ body: 'help' }),
        updates: [],
        reactions: {},
        prayer: { prayer_count: 0, prayed: false },
      },
      loading: false,
      notFound: false,
      error: null,
      reload: vi.fn(),
    });
    renderAt();
    expect(screen.getByText('help')).toBeInTheDocument();
  });

  it('author view: shows inline composer per existing thread', () => {
    usePostMock.mockReturnValue({
      data: {
        post: basePost({ author_id: 'me', is_own_post: true }),
        updates: [],
        reactions: {},
        prayer: { prayer_count: 0, prayed: false },
      },
      loading: false,
      notFound: false,
      error: null,
      reload: vi.fn(),
    });
    usePostCommentsMock.mockReturnValue({
      threads: [
        {
          participant_id: 'u1',
          participant_display_name: 'Alice',
          comments: [makeComment({ id: 'c1' })],
        },
        {
          participant_id: 'u2',
          participant_display_name: 'Bob',
          comments: [makeComment({ id: 'c2', participant_id: 'u2', display_name: 'Bob' })],
        },
      ],
      loading: false,
      error: null,
      reload: vi.fn(),
      addComment: vi.fn(),
      editComment: vi.fn(),
      deleteComment: vi.fn(),
    });
    renderAt();
    expect(screen.getAllByRole('button', { name: /^reply$/i })).toHaveLength(2);
    expect(screen.queryByPlaceholderText(/reply to/i)).not.toBeInTheDocument();
  });

  it('non-author view: shows a pinned composer with placeholder mentioning author', () => {
    usePostMock.mockReturnValue({
      data: {
        post: basePost({ display_name: 'Mary' }),
        updates: [],
        reactions: {},
        prayer: { prayer_count: 0, prayed: false },
      },
      loading: false,
      notFound: false,
      error: null,
      reload: vi.fn(),
    });
    renderAt();
    expect(screen.getByPlaceholderText(/reply to mary/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reply$/i })).not.toBeInTheDocument();
  });

  it('moderator on others post: sees other threads read-only with kebabs + their own pinned composer', () => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'sb' } },
      me: { id: 'me', email: 'm@t.local', displayName: 'Me', role: 'moderator' as const },
      loading: false,
      signOut: vi.fn(),
    });
    usePostMock.mockReturnValue({
      data: {
        post: basePost({ author_id: 'someone-else', is_own_post: false, display_name: 'Mary' }),
        updates: [],
        reactions: {},
        prayer: { prayer_count: 0, prayed: false },
      },
      loading: false,
      notFound: false,
      error: null,
      reload: vi.fn(),
    });
    usePostCommentsMock.mockReturnValue({
      threads: [
        {
          participant_id: 'u1',
          participant_display_name: 'Alice',
          comments: [makeComment({ id: 'c1' })],
        },
      ],
      loading: false,
      error: null,
      reload: vi.fn(),
      addComment: vi.fn(),
      editComment: vi.fn(),
      deleteComment: vi.fn(),
    });
    renderAt();
    expect(screen.getByRole('button', { name: /comment menu/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reply$/i })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/reply to mary/i)).toBeInTheDocument();
  });

  it('author: shows "Add update" inline composer', () => {
    usePostMock.mockReturnValue({
      data: {
        post: basePost({ author_id: 'me', is_own_post: true }),
        updates: [],
        reactions: {},
        prayer: { prayer_count: 0, prayed: false },
      },
      loading: false,
      notFound: false,
      error: null,
      reload: vi.fn(),
    });
    renderAt();
    expect(screen.getByRole('button', { name: /add update/i })).toBeInTheDocument();
  });

  it('non-author: does NOT show "Add update"', () => {
    usePostMock.mockReturnValue({
      data: {
        post: basePost({ author_id: 'other', is_own_post: false }),
        updates: [],
        reactions: {},
        prayer: { prayer_count: 0, prayed: false },
      },
      loading: false,
      notFound: false,
      error: null,
      reload: vi.fn(),
    });
    renderAt();
    expect(screen.queryByRole('button', { name: /add update/i })).not.toBeInTheDocument();
  });
});
