import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileComposePage } from './MobileComposePage';

const useDraftMock = vi.fn();
vi.mock('../../hooks/useDraft', () => ({ useDraft: () => useDraftMock() }));

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
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

const publishMyDraftMock = vi.fn();
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, publishMyDraft: (...args: unknown[]) => publishMyDraftMock(...args) };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function makeDraft(overrides?: Partial<ReturnType<typeof useDraftMock>>) {
  return {
    draft: null,
    loading: false,
    save: vi.fn(),
    flush: vi.fn().mockResolvedValue(null),
    saving: false,
    lastSavedAt: null,
    error: null,
    ...overrides,
  };
}

describe('MobileComposePage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    publishMyDraftMock.mockResolvedValue({ post: { id: 'p1' } });
    useDraftMock.mockReturnValue(makeDraft());
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-me' } },
      me: { id: 'u1', email: 'me@test.local', displayName: 'Me', role: 'member' as const },
      loading: false,
      signOut: vi.fn(),
    });
  });
  afterEach(() => vi.clearAllMocks());

  it('renders close header titled "New request" with Publish button', () => {
    render(
      <MemoryRouter>
        <MobileComposePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('New request')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish/i })).toBeDisabled();
  });

  it('Publish becomes enabled when body has content', async () => {
    render(
      <MemoryRouter>
        <MobileComposePage />
      </MemoryRouter>,
    );
    const textarea = screen.getByRole('textbox', { name: /body/i });
    await userEvent.type(textarea, 'help me pray');
    expect(screen.getByRole('button', { name: /publish/i })).toBeEnabled();
  });

  it('Publish navigates to / on success', async () => {
    render(
      <MemoryRouter>
        <MobileComposePage />
      </MemoryRouter>,
    );
    const textarea = screen.getByRole('textbox', { name: /body/i });
    await userEvent.type(textarea, 'pray');
    await userEvent.click(screen.getByRole('button', { name: /publish/i }));
    await waitFor(() => expect(publishMyDraftMock).toHaveBeenCalled());
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
  });

  it('shows error from useDraft', () => {
    useDraftMock.mockReturnValue(makeDraft({ error: 'Could not publish' }));
    render(
      <MemoryRouter>
        <MobileComposePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Could not publish')).toBeInTheDocument();
  });

  it('pin toggle visible for moderator, hidden for member', () => {
    // Member: no pin toggle
    render(
      <MemoryRouter>
        <MobileComposePage />
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText(/pin this post/i)).toBeNull();

    // Moderator: pin toggle present
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-me' } },
      me: { id: 'u1', email: 'me@test.local', displayName: 'Me', role: 'moderator' },
      loading: false,
      signOut: vi.fn(),
    });
    render(
      <MemoryRouter>
        <MobileComposePage />
      </MemoryRouter>,
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
    render(
      <MemoryRouter>
        <MobileComposePage />
      </MemoryRouter>,
    );

    const pinToggle = screen.getByLabelText(/pin this post/i);
    expect(screen.queryByRole('radiogroup', { name: /pin for/i })).toBeNull();

    await userEvent.click(pinToggle);

    const pinRadiogroup = screen.getByRole('radiogroup', { name: /pin for/i });
    expect(pinRadiogroup).toBeInTheDocument();
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
    render(
      <MemoryRouter>
        <MobileComposePage />
      </MemoryRouter>,
    );
    const textarea = screen.getByRole('textbox', { name: /body/i });
    await userEvent.type(textarea, 'pin off test');
    // Toggle is off — publish without pinning
    await userEvent.click(screen.getByRole('button', { name: /publish/i }));
    await waitFor(() => expect(publishMyDraftMock).toHaveBeenCalled());

    const callArg = publishMyDraftMock.mock.calls.at(-1)![0];
    expect(callArg).not.toHaveProperty('pin_duration_days');
  });

  it('publish payload includes pin_duration_days=3 when 3 days selected', async () => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-me' } },
      me: { id: 'u1', email: 'me@test.local', displayName: 'Me', role: 'moderator' },
      loading: false,
      signOut: vi.fn(),
    });
    render(
      <MemoryRouter>
        <MobileComposePage />
      </MemoryRouter>,
    );
    const textarea = screen.getByRole('textbox', { name: /body/i });
    await userEvent.type(textarea, 'pin on test');

    // Turn on the pin toggle
    await userEvent.click(screen.getByLabelText(/pin this post/i));
    // Select 3 days from the pin duration picker
    const pinRadiogroup = screen.getByRole('radiogroup', { name: /pin for/i });
    await userEvent.click(within(pinRadiogroup).getByRole('radio', { name: /3 days/i }));
    // Publish
    await userEvent.click(screen.getByRole('button', { name: /publish/i }));
    await waitFor(() => expect(publishMyDraftMock).toHaveBeenCalled());

    const callArg = publishMyDraftMock.mock.calls.at(-1)![0];
    expect(callArg).toEqual({ pin_duration_days: 3 });
  });
});
