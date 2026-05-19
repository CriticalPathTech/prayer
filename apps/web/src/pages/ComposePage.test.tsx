import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../lib/api';

import { ComposePage } from './ComposePage';

type AuthReturn = {
  session: { user: { id: string } } | null;
  me: {
    id: string;
    email: string;
    displayName: string;
    role: 'member' | 'moderator' | 'super_user';
  } | null;
  loading: boolean;
  signOut: () => void;
};

const useAuthMock: ReturnType<typeof vi.fn<() => AuthReturn>> = vi.fn(() => ({
  session: { user: { id: 'supabase-me' } },
  me: { id: 'u1', email: 'me@test.local', displayName: 'Me', role: 'member' as const },
  loading: false,
  signOut: vi.fn(),
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

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
  updates: [],
  expires_at: null as string | null,
  edit_deadline: new Date(Date.now() + 3600_000).toISOString(),
  created_at: new Date().toISOString(),
  pinned_at: null,
  pinned_by: null,
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

  it('pin toggle visible for moderator, hidden for member', async () => {
    // Member: no pin toggle
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-me' } },
      me: { id: 'u1', email: 'me@test.local', displayName: 'Me', role: 'member' },
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({ draft: null });
    const { unmount } = renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toBe(''),
    );
    expect(screen.queryByLabelText(/pin this post/i)).toBeNull();
    unmount();

    // Moderator: pin toggle present
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-me' } },
      me: { id: 'u1', email: 'me@test.local', displayName: 'Me', role: 'moderator' },
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({ draft: null });
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toBe(''),
    );
    expect(screen.getByLabelText(/pin this post/i)).toBeInTheDocument();
  });

  it('toggling pin on shows duration picker with 1 week active by default', async () => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-me' } },
      me: { id: 'u1', email: 'me@test.local', displayName: 'Me', role: 'moderator' },
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({ draft: null });
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toBe(''),
    );

    const pinToggle = screen.getByLabelText(/pin this post/i);
    expect(screen.queryByRole('radiogroup', { name: /pin for/i })).toBeNull();

    await userEvent.click(pinToggle);

    const pinRadiogroup = screen.getByRole('radiogroup', { name: /pin for/i });
    expect(pinRadiogroup).toBeInTheDocument();
    // 1 week (7 days) should be active (aria-checked="true")
    const oneWeekBtn = within(pinRadiogroup).getByRole('radio', { name: /1 week/i });
    expect(oneWeekBtn).toHaveAttribute('aria-checked', 'true');
  });

  it('publish payload omits pin_duration_days when toggle is off', async () => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-me' } },
      me: { id: 'u1', email: 'me@test.local', displayName: 'Me', role: 'moderator' },
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({
      draft: { ...baseDraft, body: 'pin off test' } as never,
    });
    vi.mocked(api.saveMyDraft).mockResolvedValue({
      draft: { ...baseDraft, body: 'pin off test' } as never,
    });
    vi.mocked(api.publishMyDraft).mockResolvedValueOnce({
      post: { ...baseDraft, id: 'published-2', status: 'published' } as never,
    });
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toBe('pin off test'),
    );

    // Toggle is off — publish without pinning
    await userEvent.click(screen.getByRole('button', { name: /share/i }));
    await waitFor(() => expect(api.publishMyDraft).toHaveBeenCalled());

    const callArg = vi.mocked(api.publishMyDraft).mock.calls.at(-1)![0];
    expect(callArg).not.toHaveProperty('pin_duration_days');
  });

  it('publish payload includes pin_duration_days=3 when 3 days selected', async () => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-me' } },
      me: { id: 'u1', email: 'me@test.local', displayName: 'Me', role: 'moderator' },
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(api.getMyDraft).mockResolvedValueOnce({
      draft: { ...baseDraft, body: 'pin on test' } as never,
    });
    vi.mocked(api.saveMyDraft).mockResolvedValue({
      draft: { ...baseDraft, body: 'pin on test' } as never,
    });
    vi.mocked(api.publishMyDraft).mockResolvedValueOnce({
      post: { ...baseDraft, id: 'published-3', status: 'published' } as never,
    });
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toBe('pin on test'),
    );

    // Turn on the pin toggle
    await userEvent.click(screen.getByLabelText(/pin this post/i));
    // Select 3 days from the pin duration picker
    const pinRadiogroup = screen.getByRole('radiogroup', { name: /pin for/i });
    await userEvent.click(within(pinRadiogroup).getByRole('radio', { name: /3 days/i }));
    // Publish
    await userEvent.click(screen.getByRole('button', { name: /share/i }));
    await waitFor(() => expect(api.publishMyDraft).toHaveBeenCalled());

    const callArg = vi.mocked(api.publishMyDraft).mock.calls.at(-1)![0];
    expect(callArg).toEqual({ pin_duration_days: 3 });
  });
});
