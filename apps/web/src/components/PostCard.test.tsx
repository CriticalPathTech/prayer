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
    answered_updates: [],
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
      answered_updates: [],
    };
    const later = {
      ...base,
      id: 'child2',
      parent_id: 'p1',
      is_answered_prayer: true,
      body: 'thank you Lord',
      answered_updates: [],
    };
    render(
      <MemoryRouter>
        <PostCard
          post={{ ...base, is_answered_prayer: true, answered_updates: [earlier, later] }}
        />
      </MemoryRouter>,
    );
    // Both updates render.
    expect(screen.getByText('first witness')).toBeInTheDocument();
    expect(screen.getByText('thank you Lord')).toBeInTheDocument();
    // Embedded mode: the "Prayer answered" ribbon is suppressed when any
    // answered_updates render (the embedded cards carry the answered treatment
    // on their own). The "Answered" eyebrow inside each embedded card stays.
    expect(screen.queryByText('Prayer answered')).not.toBeInTheDocument();
    expect(screen.getAllByText('Answered')).toHaveLength(2);
    // Embedded mode: the child's author name is hidden because updates are
    // always authored by the parent post's author. `base.display_name` is
    // 'Mary', which appears once in the parent card header.
    expect(screen.getAllByText('Mary')).toHaveLength(1);
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
    answered_updates: [],
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
