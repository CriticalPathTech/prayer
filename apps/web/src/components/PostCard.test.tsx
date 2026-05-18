import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PostCard } from './PostCard';

const apiFetchMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetchMock(...a) };
});

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    me: { id: 'viewer', role: 'member' },
    session: {},
    loading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../hooks/usePrayer', () => ({
  usePrayer: () => ({ prayed: false, prayerCount: 0, toggle: vi.fn() }),
}));
vi.mock('../hooks/useReactions', () => ({
  useReactions: () => ({ reactions: {}, toggle: vi.fn() }),
}));

describe('PostCard Answered Prayer', () => {
  const base = {
    id: 'p1',
    parent_id: null,
    author_id: 'other',
    display_name: 'Mary',
    avatar_url: null,
    status: 'published' as const,
    is_anonymous: false,
    is_answered_prayer: false,
    body: 'Please pray.',
    reaction_count: 0,
    prayer_count: 0,
    updates: [],
    expires_at: null,
    edit_deadline: new Date(Date.now() + 3600_000).toISOString(),
    created_at: new Date().toISOString(),
    prayed: false,
    reactions: {},
    is_own_post: false,
    hidden_by: null,
    hidden_source: null,
    is_former_member: false,
  };
  it('renders Prayer answered ribbon when is_answered_prayer is true', () => {
    render(
      <MemoryRouter>
        <PostCard post={{ ...base, is_answered_prayer: true }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Prayer answered')).toBeInTheDocument();
  });

  it('does not render Prayer answered ribbon when is_answered_prayer is false', () => {
    render(
      <MemoryRouter>
        <PostCard post={base} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Prayer answered')).not.toBeInTheDocument();
  });

  it('renders Former member when is_former_member && !is_anonymous', () => {
    render(
      <MemoryRouter>
        <PostCard post={{ ...base, is_former_member: true }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Former member')).toBeInTheDocument();
    expect(screen.queryByText('Mary')).not.toBeInTheDocument();
  });

  it('renders Anonymous (not Former member) when both flags are true', () => {
    render(
      <MemoryRouter>
        <PostCard post={{ ...base, is_anonymous: true, is_former_member: true }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
    expect(screen.queryByText('Former member')).not.toBeInTheDocument();
  });

  it('renders every embedded answered update chronologically', () => {
    const earlier = {
      ...base,
      id: 'child1',
      parent_id: 'p1',
      is_answered_prayer: true,
      body: 'first witness',
      updates: [],
    };
    const later = {
      ...base,
      id: 'child2',
      parent_id: 'p1',
      is_answered_prayer: true,
      body: 'thank you Lord',
      updates: [],
    };
    render(
      <MemoryRouter>
        <PostCard post={{ ...base, is_answered_prayer: true, updates: [earlier, later] }} />
      </MemoryRouter>,
    );
    // Both updates render.
    expect(screen.getByText('first witness')).toBeInTheDocument();
    expect(screen.getByText('thank you Lord')).toBeInTheDocument();
    // Embedded mode: the "Prayer answered" ribbon is suppressed when any
    // inline update carries the answered flag (the embedded cards carry
    // the treatment themselves). The "Answered" eyebrow inside each
    // embedded card stays.
    expect(screen.queryByText('Prayer answered')).not.toBeInTheDocument();
    expect(screen.getAllByText('Answered')).toHaveLength(2);
    // Embedded mode: the child's author name is hidden because updates are
    // always authored by the parent post's author. `base.display_name` is
    // 'Mary', which appears once in the parent card header.
    expect(screen.getAllByText('Mary')).toHaveLength(1);
  });
});

describe('PostCard inline updates', () => {
  const base = {
    id: 'parent',
    parent_id: null,
    author_id: 'other',
    display_name: 'Mary',
    avatar_url: null,
    status: 'published' as const,
    is_anonymous: false,
    is_answered_prayer: false,
    body: 'Please pray.',
    reaction_count: 0,
    prayer_count: 0,
    updates: [],
    expires_at: null,
    edit_deadline: new Date(Date.now() + 3600_000).toISOString(),
    created_at: new Date().toISOString(),
    prayed: false,
    reactions: {},
    is_own_post: false,
    hidden_by: null,
    hidden_source: null,
    is_former_member: false,
  };

  function makeUpdate(id: string, body: string) {
    return { ...base, id, parent_id: 'parent', body, updates: [] };
  }

  it('renders all updates inline when there are 1–3', () => {
    const updates = [
      makeUpdate('u1', 'first update'),
      makeUpdate('u2', 'second update'),
      makeUpdate('u3', 'third update'),
    ];
    render(
      <MemoryRouter>
        <PostCard post={{ ...base, updates }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('first update')).toBeInTheDocument();
    expect(screen.getByText('second update')).toBeInTheDocument();
    expect(screen.getByText('third update')).toBeInTheDocument();
    expect(screen.queryByText(/older update/i)).not.toBeInTheDocument();
  });

  it('renders the 3 most recent updates plus "+N older updates" link when there are 4+', () => {
    const updates = [
      makeUpdate('u1', 'oldest'),
      makeUpdate('u2', 'older'),
      makeUpdate('u3', 'recent-3'),
      makeUpdate('u4', 'recent-2'),
      makeUpdate('u5', 'newest'),
    ];
    render(
      <MemoryRouter>
        <PostCard post={{ ...base, updates }} />
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
      makeUpdate('u0', 'old'),
      makeUpdate('u1', 'a'),
      makeUpdate('u2', 'b'),
      makeUpdate('u3', 'c'),
    ];
    render(
      <MemoryRouter>
        <PostCard post={{ ...base, updates }} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /\+1 older update\b/i });
    expect(link).toBeInTheDocument();
    expect(link).not.toHaveAccessibleName(/updates/);
  });

  it('truncates a long update body and "Show more" expands it', async () => {
    const user = userEvent.setup();
    const longBody = 'L'.repeat(500);
    const updates = [makeUpdate('u1', longBody)];
    render(
      <MemoryRouter>
        <PostCard post={{ ...base, updates }} />
      </MemoryRouter>,
    );
    const showMore = screen.getByRole('button', { name: /show more/i });
    expect(showMore).toBeInTheDocument();
    expect(screen.getByText(/L{250}…/)).toBeInTheDocument();
    await user.click(showMore);
    expect(screen.getByText(longBody)).toBeInTheDocument();
  });

  it('hides the "Prayer answered" ribbon when an inline update carries is_answered_prayer=true', () => {
    const answeredUpdate = {
      ...makeUpdate('u1', 'answer'),
      is_answered_prayer: true,
    };
    render(
      <MemoryRouter>
        <PostCard post={{ ...base, is_answered_prayer: true, updates: [answeredUpdate] }} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Prayer answered')).not.toBeInTheDocument();
  });

  it('shows the "Prayer answered" ribbon when answered=true and no inline update is answered', () => {
    const inline = makeUpdate('u1', 'just an update');
    render(
      <MemoryRouter>
        <PostCard post={{ ...base, is_answered_prayer: true, updates: [inline] }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Prayer answered')).toBeInTheDocument();
  });

  it('gives the parent card the gold border when an inline update is answered, even if parent.is_answered_prayer is false', () => {
    const answeredUpdate = { ...makeUpdate('u1', 'answer'), is_answered_prayer: true };
    const { container } = render(
      <MemoryRouter>
        <PostCard post={{ ...base, is_answered_prayer: false, updates: [answeredUpdate] }} />
      </MemoryRouter>,
    );
    const card = container.querySelector('article');
    expect(card).not.toBeNull();
    expect(card!.className).toContain('[var(--answered-border)]');
  });

  it('gives the parent card the gold border when an answered update is in the older bucket (not inline)', () => {
    const oldAnswered = { ...makeUpdate('u-old', 'answered moment'), is_answered_prayer: true };
    const inline1 = makeUpdate('u1', 'a');
    const inline2 = makeUpdate('u2', 'b');
    const inline3 = makeUpdate('u3', 'c');
    const { container } = render(
      <MemoryRouter>
        <PostCard
          post={{
            ...base,
            is_answered_prayer: false,
            updates: [oldAnswered, inline1, inline2, inline3],
          }}
        />
      </MemoryRouter>,
    );
    const card = container.querySelector('article');
    expect(card!.className).toContain('[var(--answered-border)]');
    // Sanity: the answered update is hidden behind the older-updates link.
    expect(screen.queryByText('answered moment')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\+1 older update\b/i })).toBeInTheDocument();
  });

  it('renders the inline answered update without its own gold wrapper', () => {
    const answeredUpdate = { ...makeUpdate('u1', 'answered body'), is_answered_prayer: true };
    const { container } = render(
      <MemoryRouter>
        <PostCard post={{ ...base, updates: [answeredUpdate] }} />
      </MemoryRouter>,
    );
    // The inline update article (the second <article> in the card; the
    // parent post is the first).
    const articles = container.querySelectorAll('article');
    const updateArticle = articles[1];
    expect(updateArticle).toBeDefined();
    // Wrapper is the neutral variant — no gold bg/border on the inner item.
    expect(updateArticle!.className).not.toContain('from-dawn-50');
    expect(updateArticle!.className).toContain('[var(--border-soft)]');
    // The textual "Answered" eyebrow is still there.
    expect(screen.getByText('Answered')).toBeInTheDocument();
  });
});

describe('PostCard kebab menu', () => {
  const base = {
    id: 'p1',
    parent_id: null,
    author_id: 'other',
    display_name: 'Mary',
    avatar_url: null,
    status: 'published' as const,
    is_anonymous: false,
    is_answered_prayer: false,
    body: 'Please pray.',
    reaction_count: 0,
    prayer_count: 0,
    updates: [],
    expires_at: null,
    edit_deadline: new Date(Date.now() + 3600_000).toISOString(),
    created_at: new Date().toISOString(),
    prayed: false,
    reactions: {},
    is_own_post: false,
    hidden_by: null,
    hidden_source: null,
    is_former_member: false,
  };

  beforeEach(() => {
    apiFetchMock.mockReset();
  });
  afterEach(() => {
    apiFetchMock.mockReset();
  });

  it('renders the kebab button for a non-own post and exposes Report in its menu', async () => {
    render(
      <MemoryRouter>
        <PostCard post={base} />
      </MemoryRouter>,
    );
    const kebab = screen.getByRole('button', { name: /more actions/i });
    expect(kebab).toBeInTheDocument();
    await userEvent.click(kebab);
    expect(screen.getByRole('menuitem', { name: 'Report' })).toBeInTheDocument();
  });

  it('does not render a standalone Report button (only inside the menu)', () => {
    render(
      <MemoryRouter>
        <PostCard post={base} />
      </MemoryRouter>,
    );
    // Menu starts closed; no Report button anywhere in the initial render.
    expect(screen.queryByRole('button', { name: /^report$/i })).not.toBeInTheDocument();
  });

  it('exposes Edit and Delete menuitems for an own post', async () => {
    const own = { ...base, is_own_post: true, author_id: 'viewer' };
    const onChange = vi.fn();
    render(
      <MemoryRouter>
        <PostCard post={own} onChange={onChange} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
  });

  it('calls onChange after a successful delete', async () => {
    apiFetchMock.mockResolvedValueOnce(null);
    const own = { ...base, is_own_post: true, author_id: 'viewer' };
    const onChange = vi.fn();
    render(
      <MemoryRouter>
        <PostCard post={own} onChange={onChange} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/posts/p1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
