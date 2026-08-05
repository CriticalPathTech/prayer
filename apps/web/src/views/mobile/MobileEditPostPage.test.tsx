import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileEditPostPage } from './MobileEditPostPage';

const apiFetchMock = vi.fn();
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const usePostMock = vi.fn();
vi.mock('../../hooks/usePost', () => ({ usePost: () => usePostMock() }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const farFuture = new Date(Date.now() + 30 * 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();

function renderAtUrl(url = '/posts/p1/edit') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/posts/:id/edit" element={<MobileEditPostPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MobileEditPostPage', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    navigateMock.mockReset();
    usePostMock.mockReturnValue({
      data: {
        post: {
          id: 'p1',
          body: 'old body',
          edit_deadline: farFuture,
          expires_at: null,
          status: 'published',
          is_own_post: true,
          author_id: 'me',
          images: [],
        },
        updates: [],
        reactions: {},
        prayer: { prayer_count: 0, prayed: false },
      },
      loading: false,
      notFound: false,
      error: null,
    });
  });
  afterEach(() => vi.clearAllMocks());

  it('pre-fills body and shows Edit request title', async () => {
    renderAtUrl();
    expect(screen.getByText('Edit request')).toBeInTheDocument();
    expect(screen.getByLabelText(/body/i)).toHaveValue('old body');
  });

  it('Save is disabled when not dirty', () => {
    renderAtUrl();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('Save enables when body changes', async () => {
    renderAtUrl();
    await userEvent.type(screen.getByLabelText(/body/i), '!');
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
  });

  it('Save PATCHes /posts/:id and navigates back on success', async () => {
    apiFetchMock.mockResolvedValue({});
    renderAtUrl();
    await userEvent.type(screen.getByLabelText(/body/i), '!');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(apiFetchMock.mock.calls[0]![0]).toBe('/posts/p1');
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith(-1));
  });

  it('renders images read-only with frozen-set copy, no ImageTray', () => {
    usePostMock.mockReturnValue({
      data: {
        post: {
          id: 'p1',
          body: 'old body',
          edit_deadline: farFuture,
          expires_at: null,
          status: 'published',
          is_own_post: true,
          author_id: 'me',
          images: [{ id: 'i1', url: 'f1', thumb_url: 't1', width: 10, height: 10, purged: false }],
        },
        updates: [],
        reactions: {},
        prayer: { prayer_count: 0, prayed: false },
      },
      loading: false,
      notFound: false,
      error: null,
    });
    renderAtUrl();
    expect(screen.getByAltText('Cover photo')).toBeInTheDocument();
    expect(
      screen.getByText(/photos can.t be changed after a prayer request is shared/i),
    ).toBeInTheDocument();
    // Read-only: no upload/remove affordances from ImageTray.
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('shows "edit window has passed" when deadline is in the past', () => {
    usePostMock.mockReturnValue({
      data: {
        post: {
          id: 'p1',
          body: 'old',
          edit_deadline: past,
          expires_at: null,
          status: 'published',
          is_own_post: true,
          author_id: 'me',
          images: [],
        },
        updates: [],
        reactions: {},
        prayer: { prayer_count: 0, prayed: false },
      },
      loading: false,
      notFound: false,
      error: null,
    });
    renderAtUrl();
    expect(screen.getByText(/edit window has passed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });
});
