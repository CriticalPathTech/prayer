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
});
