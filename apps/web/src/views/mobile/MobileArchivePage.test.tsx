import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileArchivePage } from './MobileArchivePage';
import { makeFeedPost } from './__fixtures__/feedPost';

const apiFetchMock = vi.fn();
const getMyDraftMock = vi.fn();
const saveMyDraftMock = vi.fn();
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetchMock(...args),
    getMyDraft: (...args: unknown[]) => getMyDraftMock(...args),
    saveMyDraft: (...args: unknown[]) => saveMyDraftMock(...args),
  };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const usePrayerMock = vi.fn(() => ({ prayed: false, prayerCount: 0, toggle: vi.fn() }));
vi.mock('../../hooks/usePrayer', () => ({ usePrayer: () => usePrayerMock() }));

const useReactionsMock = vi.fn(() => ({ reactions: {}, toggle: vi.fn() }));
vi.mock('../../hooks/useReactions', () => ({ useReactions: () => useReactionsMock() }));

describe('MobileArchivePage', () => {
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
      posts: [makeFeedPost({ display_name: 'Past', body: 'old prayer' })],
    });
    render(
      <MemoryRouter>
        <MobileArchivePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('old prayer')).toBeInTheDocument());
    expect(apiFetchMock).toHaveBeenCalledWith('/posts/me/archive');
  });

  it('shows empty-state copy when no archived posts', async () => {
    apiFetchMock.mockResolvedValue({ posts: [] });
    render(
      <MemoryRouter>
        <MobileArchivePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/your archive is empty/i)).toBeInTheDocument());
  });

  it('renders an Archive header (back variant)', async () => {
    apiFetchMock.mockResolvedValue({ posts: [] });
    render(
      <MemoryRouter>
        <MobileArchivePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('shows error message on fetch failure', async () => {
    apiFetchMock.mockRejectedValue(new Error('boom'));
    render(
      <MemoryRouter>
        <MobileArchivePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument());
  });

  it('Repost on archived own post with empty draft writes to /me/draft and navigates', async () => {
    const archived = makeFeedPost({
      body: 'mobile reuse',
      is_anonymous: true,
      is_own_post: true,
      status: 'archived',
    });
    apiFetchMock.mockResolvedValue({ posts: [archived] });
    getMyDraftMock.mockResolvedValue({ draft: null });

    render(
      <MemoryRouter>
        <MobileArchivePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('mobile reuse')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Repost' }));

    await waitFor(() =>
      expect(saveMyDraftMock).toHaveBeenCalledWith({ body: 'mobile reuse', is_anonymous: true }),
    );
    expect(navigateMock).toHaveBeenCalledWith('/compose');
  });

  it('Repost with non-empty draft opens the discard confirm dialog', async () => {
    const archived = makeFeedPost({ body: 'reuse', is_own_post: true, status: 'archived' });
    apiFetchMock.mockResolvedValue({ posts: [archived] });
    getMyDraftMock.mockResolvedValue({ draft: makeFeedPost({ body: 'in progress' }) });

    render(
      <MemoryRouter>
        <MobileArchivePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('reuse')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Repost' }));

    expect(
      await screen.findByRole('alertdialog', { name: /discard your draft/i }),
    ).toBeInTheDocument();
    expect(saveMyDraftMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
