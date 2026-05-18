import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeFeedPost } from '../views/mobile/__fixtures__/feedPost';

import { MyArchivePage } from './MyArchivePage';

const apiFetchMock = vi.fn();
const getMyDraftMock = vi.fn();
const saveMyDraftMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    apiFetch: (...a: unknown[]) => apiFetchMock(...a),
    getMyDraft: (...a: unknown[]) => getMyDraftMock(...a),
    saveMyDraft: (...a: unknown[]) => saveMyDraftMock(...a),
  };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const useAuthMock = vi.fn();
vi.mock('../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const usePrayerMock = vi.fn(() => ({ prayed: false, prayerCount: 0, toggle: vi.fn() }));
vi.mock('../hooks/usePrayer', () => ({ usePrayer: () => usePrayerMock() }));

const useReactionsMock = vi.fn(() => ({ reactions: {}, toggle: vi.fn() }));
vi.mock('../hooks/useReactions', () => ({ useReactions: () => useReactionsMock() }));

describe('MyArchivePage', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'sb' } },
      me: { id: 'me', email: 'm@t.local', displayName: 'Me', role: 'member' as const },
      loading: false,
      signOut: vi.fn(),
    });
    saveMyDraftMock.mockResolvedValue({ draft: makeFeedPost() });
  });
  afterEach(() => {
    apiFetchMock.mockReset();
    getMyDraftMock.mockReset();
    saveMyDraftMock.mockReset();
    navigateMock.mockReset();
  });

  it('fetches /posts/me/archive on mount and renders posts', async () => {
    apiFetchMock.mockResolvedValue({
      posts: [makeFeedPost({ body: 'old prayer', is_own_post: true, status: 'archived' })],
    });
    render(
      <MemoryRouter>
        <MyArchivePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('old prayer')).toBeInTheDocument());
    expect(apiFetchMock).toHaveBeenCalledWith('/posts/me/archive');
  });

  it('Repost on an empty-draft state: writes the archive body to /me/draft and navigates to /compose', async () => {
    const archived = makeFeedPost({
      body: 'reuse me',
      is_anonymous: true,
      is_own_post: true,
      status: 'archived',
    });
    apiFetchMock.mockResolvedValue({ posts: [archived] });
    getMyDraftMock.mockResolvedValue({ draft: null });

    render(
      <MemoryRouter>
        <MyArchivePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('reuse me')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Repost' }));

    await waitFor(() =>
      expect(saveMyDraftMock).toHaveBeenCalledWith({ body: 'reuse me', is_anonymous: true }),
    );
    expect(navigateMock).toHaveBeenCalledWith('/compose');
  });

  it('Repost with a non-empty draft opens the discard confirm dialog', async () => {
    const archived = makeFeedPost({ body: 'reuse', is_own_post: true, status: 'archived' });
    apiFetchMock.mockResolvedValue({ posts: [archived] });
    getMyDraftMock.mockResolvedValue({ draft: makeFeedPost({ body: 'unsaved work' }) });

    render(
      <MemoryRouter>
        <MyArchivePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('reuse')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Repost' }));

    expect(await screen.findByRole('alertdialog', { name: /discard your draft/i })).toBeInTheDocument();
    expect(saveMyDraftMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
