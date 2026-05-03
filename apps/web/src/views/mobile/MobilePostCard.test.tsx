import { render, screen } from '@testing-library/react';
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

  it('embeds answered_updates and suppresses the Prayer answered ribbon', () => {
    const child = makeFeedPost({
      id: 'child-1',
      parent_id: 'parent-1',
      is_answered_prayer: true,
      body: 'thank you',
    });
    const parent = makeFeedPost({
      id: 'parent-1',
      is_answered_prayer: true,
      answered_updates: [child],
    });
    render(
      <MemoryRouter>
        <MobilePostCard post={parent} />
      </MemoryRouter>,
    );
    expect(screen.getByText('thank you')).toBeInTheDocument();
    expect(screen.queryByText(/prayer answered/i)).not.toBeInTheDocument();
  });

  it('shows Prayer answered ribbon when is_answered_prayer is true and answered_updates is empty', () => {
    render(
      <MemoryRouter>
        <MobilePostCard post={makeFeedPost({ is_answered_prayer: true })} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/prayer answered/i)).toBeInTheDocument();
  });

  it('handles missing answered_updates defensively (archive endpoint case)', () => {
    const post = makeFeedPost();
    // @ts-expect-error simulate missing field at runtime
    delete post.answered_updates;
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
});
