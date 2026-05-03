import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModQueuePage } from './ModQueuePage';

const apiFetchMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetchMock(...a) };
});

const useAuthMock = vi.fn();
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('ModQueuePage', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    useAuthMock.mockReset();
  });
  afterEach(() => {
    apiFetchMock.mockReset();
    useAuthMock.mockReset();
  });

  it('redirects non-mod callers to /', () => {
    useAuthMock.mockReturnValue({
      me: { id: 'u', role: 'member', email: 'a@b', display_name: 'a' },
      session: {},
      loading: false,
      signOut: vi.fn(),
    });
    apiFetchMock.mockResolvedValue({ items: [] });
    render(
      <MemoryRouter initialEntries={['/mod/queue']}>
        <ModQueuePage />
      </MemoryRouter>,
    );
    // Navigate is rendered for non-mod; there's no heading to find
    expect(screen.queryByText(/moderation queue/i)).not.toBeInTheDocument();
  });

  it('renders queue items for moderator', async () => {
    useAuthMock.mockReturnValue({
      me: { id: 'm', role: 'moderator', email: 'm@b', display_name: 'm' },
      session: {},
      loading: false,
      signOut: vi.fn(),
    });
    apiFetchMock.mockResolvedValue({
      items: [
        {
          target_type: 'post',
          target_id: 'p1',
          post_id: 'p1',
          author_display_name: 'Author',
          preview: 'hello',
          flag_count: 2,
          reasons: ['off_topic'],
          first_flag_at: new Date().toISOString(),
          latest_flag_at: new Date().toISOString(),
          hidden: false,
          hide_source: null,
        },
      ],
    });
    render(
      <MemoryRouter initialEntries={['/mod/queue']}>
        <ModQueuePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/hello/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /hide/i })).toBeInTheDocument();
  });
});
