import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeedPost } from '../hooks/useFeed';
import { ApiError } from '../lib/api';

import { EditPostPage } from './EditPostPage';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const apiFetchMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetchMock(...a) };
});

const samplePost: FeedPost = {
  id: 'p1',
  parent_id: null,
  author_id: 'u1',
  display_name: 'Me',
  avatar_url: null,
  status: 'published',
  is_anonymous: false,
  is_answered_prayer: false,
  body: 'original body\nwith newline',
  reaction_count: 0,
  prayer_count: 0,
  updates: [],
  expires_at: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
  edit_deadline: new Date(Date.now() + 3600_000).toISOString(),
  created_at: new Date().toISOString(),
  prayed: false,
  reactions: {},
  is_own_post: true,
  hidden_by: null,
  hidden_source: null,
  is_former_member: false,
};

function mountEditPage(postId = 'p1'): void {
  render(
    <MemoryRouter initialEntries={[`/posts/${postId}/edit`]}>
      <Routes>
        <Route path="/posts/:id/edit" element={<EditPostPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EditPostPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    apiFetchMock.mockReset();
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('loads post and hydrates textarea with the server body', async () => {
    apiFetchMock.mockResolvedValueOnce({
      post: samplePost,
      updates: [],
      reactions: {},
      prayer: { prayer_count: 0, prayed: false },
    });
    mountEditPage();
    const ta = await screen.findByLabelText(/body/i);
    // waitFor retries the value check; findByLabelText resolves as soon as the
    // textarea is in the DOM, but the hydration useEffect (which sets `body`)
    // runs in a later tick. CI runners surface this race; locally it usually
    // passes by accident.
    await waitFor(() => expect(ta).toHaveValue('original body\nwith newline'));
  });

  it('hydrates from the buffer when one exists (buffer wins over server)', async () => {
    localStorage.setItem(
      'post_edit_buffer:p1',
      JSON.stringify({ body: 'buffered body', savedAt: Date.now() }),
    );
    apiFetchMock.mockResolvedValueOnce({
      post: samplePost,
      updates: [],
      reactions: {},
      prayer: { prayer_count: 0, prayed: false },
    });
    mountEditPage();
    const ta = await screen.findByLabelText(/body/i);
    await waitFor(() => expect(ta).toHaveValue('buffered body'));
  });

  it('persists typing to the buffer', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({
      post: samplePost,
      updates: [],
      reactions: {},
      prayer: { prayer_count: 0, prayed: false },
    });
    mountEditPage();
    const ta = await screen.findByLabelText(/body/i);
    await user.clear(ta);
    await user.type(ta, 'new text');
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('post_edit_buffer:p1') ?? 'null');
      expect(stored?.body).toBe('new text');
    });
  });

  it('Save PATCHes, clears the buffer, and navigates to /posts/:id', async () => {
    apiFetchMock
      .mockResolvedValueOnce({
        post: samplePost,
        updates: [],
        reactions: {},
        prayer: { prayer_count: 0, prayed: false },
      })
      .mockResolvedValueOnce({ post: samplePost });
    localStorage.setItem('post_edit_buffer:p1', JSON.stringify({ body: 'updated', savedAt: 1 }));
    mountEditPage();
    await screen.findByLabelText(/body/i);
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      const patchCall = apiFetchMock.mock.calls.find(
        ([path, init]) =>
          path === '/posts/p1' && (init as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
    });
    await waitFor(() => {
      expect(localStorage.getItem('post_edit_buffer:p1')).toBeNull();
    });
    expect(navigateMock).toHaveBeenCalledWith('/posts/p1');
  });

  it('Save with EDIT_DEADLINE_PASSED response disables Save and keeps the buffer', async () => {
    apiFetchMock
      .mockResolvedValueOnce({
        post: samplePost,
        updates: [],
        reactions: {},
        prayer: { prayer_count: 0, prayed: false },
      })
      .mockRejectedValueOnce(new ApiError(403, 'EDIT_DEADLINE_PASSED', 'Edit window has passed'));
    localStorage.setItem('post_edit_buffer:p1', JSON.stringify({ body: 'updated', savedAt: 1 }));
    mountEditPage();
    await screen.findByLabelText(/body/i);
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/edit window has passed/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(localStorage.getItem('post_edit_buffer:p1')).not.toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('Save with generic error shows the message, keeps the buffer, does not navigate', async () => {
    apiFetchMock
      .mockResolvedValueOnce({
        post: samplePost,
        updates: [],
        reactions: {},
        prayer: { prayer_count: 0, prayed: false },
      })
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Server on fire'));
    localStorage.setItem('post_edit_buffer:p1', JSON.stringify({ body: 'updated', savedAt: 1 }));
    mountEditPage();
    await screen.findByLabelText(/body/i);
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/server on fire/i)).toBeInTheDocument();
    });
    expect(localStorage.getItem('post_edit_buffer:p1')).not.toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('Cancel navigates back without clearing the buffer', async () => {
    apiFetchMock.mockResolvedValueOnce({
      post: samplePost,
      updates: [],
      reactions: {},
      prayer: { prayer_count: 0, prayed: false },
    });
    localStorage.setItem('post_edit_buffer:p1', JSON.stringify({ body: 'keep me', savedAt: 1 }));
    mountEditPage();
    await screen.findByLabelText(/body/i);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(navigateMock).toHaveBeenCalledWith('/posts/p1');
    expect(localStorage.getItem('post_edit_buffer:p1')).not.toBeNull();
  });

  it('disables Save when body is empty', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({
      post: samplePost,
      updates: [],
      reactions: {},
      prayer: { prayer_count: 0, prayed: false },
    });
    mountEditPage();
    const ta = await screen.findByLabelText(/body/i);
    await user.clear(ta);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('disables Save when edit deadline has passed', async () => {
    const expired = { ...samplePost, edit_deadline: new Date(Date.now() - 1000).toISOString() };
    apiFetchMock.mockResolvedValueOnce({
      post: expired,
      updates: [],
      reactions: {},
      prayer: { prayer_count: 0, prayed: false },
    });
    mountEditPage();
    await screen.findByLabelText(/body/i);
    // The deadline check runs in a useEffect that fires after data arrives, so
    // findByLabelText can resolve before deadlinePassed flips. waitFor retries
    // until the effect has flushed — the same fix the EDIT_DEADLINE_PASSED test
    // above uses for the API-error variant.
    await waitFor(() => {
      expect(screen.getByText(/edit window has passed/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('renders "not allowed" for a post that is not the user\'s own', async () => {
    const other = { ...samplePost, is_own_post: false };
    apiFetchMock.mockResolvedValueOnce({
      post: other,
      updates: [],
      reactions: {},
      prayer: { prayer_count: 0, prayed: false },
    });
    mountEditPage();
    await screen.findByText(/you can only edit your own posts/i);
    expect(screen.queryByLabelText(/body/i)).not.toBeInTheDocument();
  });
});
