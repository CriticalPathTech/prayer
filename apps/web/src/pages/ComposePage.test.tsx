import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../lib/api';

import { ComposePage } from './ComposePage';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    getMyDraft: vi.fn(),
    saveMyDraft: vi.fn(),
    publishMyDraft: vi.fn(),
  };
});
const api = await import('../lib/api');

const baseDraft = {
  id: 'p1',
  parent_id: null,
  author_id: 'u1',
  display_name: 'me',
  avatar_url: null,
  status: 'draft' as const,
  is_anonymous: false,
  is_answered_prayer: false,
  body: '',
  reaction_count: 0,
  prayer_count: 0,
  answered_updates: [],
  expires_at: null as string | null,
  edit_deadline: new Date(Date.now() + 3600_000).toISOString(),
  created_at: new Date().toISOString(),
  prayed: false,
  reactions: {},
  is_own_post: true,
  hidden_by: null,
  hidden_source: null,
};

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/compose']}>
      <Routes>
        <Route path="/compose" element={<ComposePage />} />
        <Route path="/posts/:id" element={<div>navigated-{window.location.pathname}</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ComposePage', () => {
  it('renders an empty form when the user has no draft', async () => {
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({ draft: null });
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toBe(''),
    );
  });

  it('hydrates the form from an existing draft', async () => {
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({
      draft: { ...baseDraft, body: 'saved earlier', is_anonymous: true } as never,
    });
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toBe('saved earlier'),
    );
    expect((screen.getByLabelText(/anonymous/i) as HTMLInputElement).checked).toBe(true);
  });

  it('debounce-saves body edits to PUT /me/draft', async () => {
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({ draft: null });
    vi.mocked(api.saveMyDraft).mockResolvedValue({
      draft: { ...baseDraft, body: 'please pray' } as never,
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();
    await vi.waitFor(() =>
      expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toBe(''),
    );

    await user.type(screen.getByLabelText(/body/i), 'please pray');
    await vi.advanceTimersByTimeAsync(900);

    await vi.waitFor(() => expect(api.saveMyDraft).toHaveBeenCalled());
    const lastCall = vi.mocked(api.saveMyDraft).mock.calls.at(-1)!;
    expect(lastCall[0]).toMatchObject({ body: 'please pray' });
  });

  it('Share flushes pending save then publishes and navigates', async () => {
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({ draft: null });
    vi.mocked(api.saveMyDraft).mockResolvedValue({
      draft: { ...baseDraft, body: 'hi' } as never,
    });
    vi.mocked(api.publishMyDraft).mockResolvedValueOnce({
      post: { ...baseDraft, id: 'published-1', status: 'published' } as never,
    });
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toBe(''),
    );
    await userEvent.type(screen.getByLabelText(/body/i), 'hi');
    await userEvent.click(screen.getByRole('button', { name: /share/i }));

    await waitFor(() => expect(api.saveMyDraft).toHaveBeenCalled());
    await waitFor(() => expect(api.publishMyDraft).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/navigated-/)).toBeInTheDocument());
  });

  it('Share disabled when body is empty', async () => {
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({ draft: null });
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toBe(''),
    );
    expect(screen.getByRole('button', { name: /share/i })).toBeDisabled();
  });

  it('surfaces publish errors inline and stays on the page', async () => {
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({
      draft: { ...baseDraft, body: 'ready' } as never,
    });
    vi.mocked(api.publishMyDraft).mockRejectedValueOnce(
      new ApiError(400, 'VALIDATION_ERROR', 'body is required to publish'),
    );
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toBe('ready'),
    );
    await userEvent.click(screen.getByRole('button', { name: /share/i }));
    expect(await screen.findByText(/body is required to publish/i)).toBeInTheDocument();
  });

  it('no "Keep draft" button is rendered', async () => {
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({ draft: null });
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toBe(''),
    );
    expect(screen.queryByRole('button', { name: /keep draft/i })).toBeNull();
  });
});
