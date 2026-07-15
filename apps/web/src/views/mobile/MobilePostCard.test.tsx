import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobilePostCard } from './MobilePostCard';
import { makeFeedPost } from './__fixtures__/feedPost';

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const usePrayerMock = vi.fn();
vi.mock('../../hooks/usePrayer', () => ({ usePrayer: () => usePrayerMock() }));

const useReactionsMock = vi.fn();
vi.mock('../../hooks/useReactions', () => ({ useReactions: () => useReactionsMock() }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

describe('MobilePostCard', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      me: { id: 'me', email: 'm@t.local', displayName: 'Me', role: 'member' as const },
      session: { user: { id: 'sb' } },
      loading: false,
      signOut: vi.fn(),
    });
    usePrayerMock.mockReturnValue({ prayed: false, prayerCount: 0, toggle: vi.fn() });
    useReactionsMock.mockReturnValue({ reactions: {}, toggle: vi.fn() });
  });
  afterEach(() => vi.clearAllMocks());

  it('renders header (name, timestamp) and body', () => {
    render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost({ display_name: 'Alice', body: 'hello' })} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('renders the Add reaction picker when no reactions exist', () => {
    render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /add reaction/i })).toBeInTheDocument();
  });

  it('shows reactions strip when at least one reaction', () => {
    useReactionsMock.mockReturnValue({
      reactions: { '🙏': { count: 3, mine: true } },
      toggle: vi.fn(),
    });
    render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost({ reactions: { '🙏': { count: 3, mine: true } } })} />
      </MemoryRouter>,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hides the Add reaction picker when all 6 emojis have reactions', () => {
    const fullSet = {
      '🙏': { count: 1, mine: false },
      '❤️': { count: 1, mine: false },
      '💪': { count: 1, mine: false },
      '😢': { count: 1, mine: false },
      '✝️': { count: 1, mine: false },
      '🙌': { count: 1, mine: false },
    };
    useReactionsMock.mockReturnValue({ reactions: fullSet, toggle: vi.fn() });
    render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost({ reactions: fullSet })} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /add reaction/i })).not.toBeInTheDocument();
  });

  it('renders dual footer buttons "I Will Pray" and "Comment"', () => {
    render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost()} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/i will pray/i)).toBeInTheDocument();
    expect(screen.getByText(/^comment$/i)).toBeInTheDocument();
  });

  it('embeds updates and suppresses the Prayer answered ribbon', () => {
    const child = makeFeedPost({
      id: 'child-1',
      parent_id: 'parent-1',
      is_answered_prayer: true,
      body: 'thank you',
    });
    const parent = makeFeedPost({
      id: 'parent-1',
      is_answered_prayer: true,
      updates: [child],
    });
    render(
      <MemoryRouter>
        <MobilePostCard post={parent} />
      </MemoryRouter>,
    );
    expect(screen.getByText('thank you')).toBeInTheDocument();
    expect(screen.queryByText(/prayer answered/i)).not.toBeInTheDocument();
  });

  it('shows Prayer answered ribbon when is_answered_prayer is true and updates is empty', () => {
    render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost({ is_answered_prayer: true })} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/prayer answered/i)).toBeInTheDocument();
  });

  it('handles missing updates defensively (archive endpoint case)', () => {
    const post = makeFeedPost();
    // @ts-expect-error simulate missing field at runtime
    delete post.updates;
    render(
      <MemoryRouter>
        <MobilePostCard post={post} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Please pray.')).toBeInTheDocument();
  });

  it('renders "Pending review" pill when status is pending', () => {
    render(
      <MemoryRouter>
        <MobilePostCard
          post={makeFeedPost({ status: 'pending', is_own_post: true, author_id: 'me' })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });

  it('does not render footer buttons (Pray/Comment) on a pending post', () => {
    render(
      <MemoryRouter>
        <MobilePostCard
          post={makeFeedPost({ status: 'pending', is_own_post: true, author_id: 'me' })}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/i will pray/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^comment$/i })).not.toBeInTheDocument();
  });

  it('does not render the reactions strip on a pending post', () => {
    render(
      <MemoryRouter>
        <MobilePostCard
          post={makeFeedPost({ status: 'pending', is_own_post: true, author_id: 'me' })}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /add reaction/i })).not.toBeInTheDocument();
  });

  it('renders tombstone when post is_tombstone', () => {
    render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost({ is_tombstone: true })} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/hidden/i)).toBeInTheDocument();
  });

  it('renders all updates inline when there are 1–3', () => {
    const updates = [
      makeFeedPost({ parent_id: 'parent', body: 'first update' }),
      makeFeedPost({ parent_id: 'parent', body: 'second update' }),
      makeFeedPost({ parent_id: 'parent', body: 'third update' }),
    ];
    render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost({ id: 'parent', updates })} />
      </MemoryRouter>,
    );
    expect(screen.getByText('first update')).toBeInTheDocument();
    expect(screen.getByText('second update')).toBeInTheDocument();
    expect(screen.getByText('third update')).toBeInTheDocument();
    expect(screen.queryByText(/older update/i)).not.toBeInTheDocument();
  });

  it('renders the 3 most recent updates plus "+N older updates" link when there are 4+', () => {
    const updates = [
      makeFeedPost({ parent_id: 'parent', body: 'oldest' }),
      makeFeedPost({ parent_id: 'parent', body: 'older' }),
      makeFeedPost({ parent_id: 'parent', body: 'recent-3' }),
      makeFeedPost({ parent_id: 'parent', body: 'recent-2' }),
      makeFeedPost({ parent_id: 'parent', body: 'newest' }),
    ];
    render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost({ id: 'parent', updates })} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('oldest')).not.toBeInTheDocument();
    expect(screen.queryByText('older')).not.toBeInTheDocument();
    expect(screen.getByText('recent-3')).toBeInTheDocument();
    expect(screen.getByText('recent-2')).toBeInTheDocument();
    expect(screen.getByText('newest')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /\+2 older updates/i });
    expect(link).toHaveAttribute('href', '/posts/parent');
  });

  it('renders "+1 older update" (singular) when there are exactly 4 updates', () => {
    const updates = [
      makeFeedPost({ parent_id: 'parent', body: 'old' }),
      makeFeedPost({ parent_id: 'parent', body: 'a' }),
      makeFeedPost({ parent_id: 'parent', body: 'b' }),
      makeFeedPost({ parent_id: 'parent', body: 'c' }),
    ];
    render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost({ id: 'parent', updates })} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /\+1 older update\b/i })).toBeInTheDocument();
  });

  it('truncates a long update body and "Show more" expands it', async () => {
    const user = userEvent.setup();
    const longBody = 'L'.repeat(500);
    const updates = [makeFeedPost({ parent_id: 'parent', body: longBody })];
    render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost({ id: 'parent', updates })} />
      </MemoryRouter>,
    );
    const showMore = screen.getByRole('button', { name: /show more/i });
    expect(showMore).toBeInTheDocument();
    expect(screen.getByText(/L{250}…/)).toBeInTheDocument();
    await user.click(showMore);
    expect(screen.getByText(longBody)).toBeInTheDocument();
  });

  it('hides the "Prayer answered" ribbon when an inline update carries is_answered_prayer=true', () => {
    const answeredUpdate = makeFeedPost({
      parent_id: 'parent',
      is_answered_prayer: true,
      body: 'thank you',
    });
    render(
      <MemoryRouter>
        <MobilePostCard
          post={makeFeedPost({
            id: 'parent',
            is_answered_prayer: true,
            updates: [answeredUpdate],
          })}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/prayer answered/i)).not.toBeInTheDocument();
  });

  it('shows the "Prayer answered" ribbon when answered=true and no inline update is answered', () => {
    const inline = makeFeedPost({ parent_id: 'parent', body: 'just an update' });
    render(
      <MemoryRouter>
        <MobilePostCard
          post={makeFeedPost({
            id: 'parent',
            is_answered_prayer: true,
            updates: [inline],
          })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/prayer answered/i)).toBeInTheDocument();
  });

  it('gives the parent card the gold border when an inline update is answered, even if parent.is_answered_prayer is false', () => {
    const answeredUpdate = makeFeedPost({
      parent_id: 'parent',
      is_answered_prayer: true,
      body: 'thank you',
    });
    const { container } = render(
      <MemoryRouter>
        <MobilePostCard
          post={makeFeedPost({
            id: 'parent',
            is_answered_prayer: false,
            updates: [answeredUpdate],
          })}
        />
      </MemoryRouter>,
    );
    const card = container.querySelector('article');
    expect(card).not.toBeNull();
    expect(card!.className).toContain('[var(--answered-border)]');
  });

  it('gives the parent card the gold border when an answered update is in the older bucket (not inline)', () => {
    const updates = [
      makeFeedPost({ parent_id: 'parent', is_answered_prayer: true, body: 'answered moment' }),
      makeFeedPost({ parent_id: 'parent', body: 'a' }),
      makeFeedPost({ parent_id: 'parent', body: 'b' }),
      makeFeedPost({ parent_id: 'parent', body: 'c' }),
    ];
    const { container } = render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost({ id: 'parent', is_answered_prayer: false, updates })} />
      </MemoryRouter>,
    );
    const card = container.querySelector('article');
    expect(card!.className).toContain('[var(--answered-border)]');
    expect(screen.queryByText('answered moment')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\+1 older update\b/i })).toBeInTheDocument();
  });

  it('renders the inline answered update without its own gold wrapper', () => {
    const answeredUpdate = makeFeedPost({
      parent_id: 'parent',
      is_answered_prayer: true,
      body: 'answered body',
    });
    const { container } = render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost({ id: 'parent', updates: [answeredUpdate] })} />
      </MemoryRouter>,
    );
    const articles = container.querySelectorAll('article');
    const updateArticle = articles[1];
    expect(updateArticle).toBeDefined();
    expect(updateArticle!.className).not.toContain('from-dawn-50');
    expect(updateArticle!.className).toContain('[var(--border-soft)]');
    expect(screen.getByText('Answered')).toBeInTheDocument();
  });

  it('wraps author name and avatar in Link to /u/:author_id for non-anonymous post', () => {
    render(
      <MemoryRouter>
        <MobilePostCard
          post={makeFeedPost({ author_id: 'u1', display_name: 'Alice', is_anonymous: false })}
        />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    const profileLink = links.find((l) => l.getAttribute('href') === '/u/u1');
    expect(profileLink).toBeDefined();
  });

  it('renders Anonymous name with no profile Link for anonymous post', () => {
    render(
      <MemoryRouter>
        <MobilePostCard
          post={makeFeedPost({ author_id: null, display_name: null, is_anonymous: true })}
        />
      </MemoryRouter>,
    );
    const links = screen.queryAllByRole('link');
    const profileLink = links.find((l) => l.getAttribute('href')?.startsWith('/u/'));
    expect(profileLink).toBeUndefined();
    expect(screen.getByText('Anonymous')).toBeDefined();
  });

  it('renders an inline pin icon (a11y-labeled) when pinned, in the metadata row', () => {
    render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost({ pinned_at: '2026-05-01T12:00:00Z' })} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('img', { name: /pinned/i })).toBeInTheDocument();
  });

  it('does not render the pin icon when pinned_at is null', () => {
    render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost({ pinned_at: null })} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('img', { name: /pinned/i })).not.toBeInTheDocument();
  });

  describe('archived footer', () => {
    it('renders Repost + View thread (Repost on left) instead of Pray/Comment when status=archived and onRepost is provided', () => {
      const onRepost = vi.fn();
      render(
        <MemoryRouter>
          <MobilePostCard
            post={makeFeedPost({ status: 'archived', author_id: 'me', is_own_post: true })}
            onRepost={onRepost}
          />
        </MemoryRouter>,
      );
      const repost = screen.getByRole('button', { name: /^repost$/i });
      const viewThread = screen.getByRole('button', { name: /view thread/i });
      expect(repost).toBeInTheDocument();
      expect(viewThread).toBeInTheDocument();
      // Repost sits to the LEFT of View thread.
      expect(repost.compareDocumentPosition(viewThread) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(screen.queryByRole('button', { name: /i will pray/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^comment$/i })).not.toBeInTheDocument();
      // Reactions strip lives outside the footer on mobile — must also be hidden.
      expect(screen.queryByRole('group', { name: /reactions on post/i })).not.toBeInTheDocument();
    });

    it('clicking the Repost footer button calls onRepost', async () => {
      const onRepost = vi.fn();
      render(
        <MemoryRouter>
          <MobilePostCard
            post={makeFeedPost({ status: 'archived', author_id: 'me', is_own_post: true })}
            onRepost={onRepost}
          />
        </MemoryRouter>,
      );
      await userEvent.click(screen.getByRole('button', { name: /^repost$/i }));
      expect(onRepost).toHaveBeenCalledTimes(1);
    });

    it('published post still shows Pray + Comment, no Repost', () => {
      render(
        <MemoryRouter>
          <MobilePostCard post={makeFeedPost({ status: 'published' })} onRepost={() => {}} />
        </MemoryRouter>,
      );
      expect(screen.getByRole('button', { name: /i will pray/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^comment$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^repost$/i })).not.toBeInTheDocument();
    });
  });

  describe('tap-to-open', () => {
    it('navigates to the post detail when the card body is tapped', async () => {
      const post = makeFeedPost({ body: 'Please pray for my family.' });
      render(
        <MemoryRouter>
          <MobilePostCard post={post} />
        </MemoryRouter>,
      );
      await userEvent.click(screen.getByText('Please pray for my family.'));
      expect(navigateMock).toHaveBeenCalledWith(`/posts/${post.id}`);
    });

    it('does not navigate when an interactive control (the ⋯ menu) is tapped', async () => {
      render(
        <MemoryRouter>
          <MobilePostCard post={makeFeedPost()} />
        </MemoryRouter>,
      );
      await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
      expect(navigateMock).not.toHaveBeenCalled();
    });

    it('does not navigate when the author profile link is tapped', async () => {
      render(
        <MemoryRouter>
          <MobilePostCard post={makeFeedPost({ display_name: 'Alice' })} />
        </MemoryRouter>,
      );
      await userEvent.click(screen.getByText('Alice'));
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });
});
