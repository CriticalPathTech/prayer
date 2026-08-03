import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModApprovalsPage } from './ModApprovalsPage';

const listApprovalsMock = vi.fn();
const approvePostMock = vi.fn();
const rejectPostMock = vi.fn();
const skipPostMock = vi.fn();

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    listApprovals: (...a: unknown[]) => listApprovalsMock(...a),
    approvePost: (...a: unknown[]) => approvePostMock(...a),
    rejectPost: (...a: unknown[]) => rejectPostMock(...a),
    skipPost: (...a: unknown[]) => skipPostMock(...a),
  };
});

const useAuthMock = vi.fn();
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const modMe = {
  id: 'm',
  email: 'm@b',
  displayName: 'Mod',
  avatarUrl: null,
  role: 'moderator' as const,
  orgRequiresPostApproval: true,
};

function makeItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p1',
    parent_id: null,
    author_id: 'u1',
    display_name: 'Mary Okafor',
    avatar_url: null,
    status: 'pending',
    is_anonymous: false,
    is_answered_prayer: false,
    body: 'Please pray for my mother.',
    reaction_count: 0,
    prayer_count: 0,
    expires_at: null,
    edit_deadline: new Date().toISOString(),
    created_at: new Date().toISOString(),
    prayed: false,
    reactions: {},
    is_own_post: false,
    hidden_by: null,
    hidden_source: null,
    is_former_member: false,
    updates: [],
    skipped_by_me: false,
    ...overrides,
  };
}

describe('ModApprovalsPage', () => {
  beforeEach(() => {
    listApprovalsMock.mockReset();
    approvePostMock.mockReset();
    rejectPostMock.mockReset();
    skipPostMock.mockReset();
    useAuthMock.mockReset();
  });
  afterEach(() => {
    listApprovalsMock.mockReset();
    approvePostMock.mockReset();
    rejectPostMock.mockReset();
    skipPostMock.mockReset();
    useAuthMock.mockReset();
  });

  it('redirects non-mod callers to /', () => {
    useAuthMock.mockReturnValue({ me: { ...modMe, role: 'member' } });
    listApprovalsMock.mockResolvedValue({ items: [] });
    render(
      <MemoryRouter initialEntries={['/mod/approvals']}>
        <ModApprovalsPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/pending approval/i)).not.toBeInTheDocument();
  });

  it('renders empty state when no pending items', async () => {
    useAuthMock.mockReturnValue({ me: modMe });
    listApprovalsMock.mockResolvedValue({ items: [] });
    render(
      <MemoryRouter>
        <ModApprovalsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/inbox zero/i)).toBeInTheDocument());
  });

  it('renders card with body and author name', async () => {
    useAuthMock.mockReturnValue({ me: modMe });
    listApprovalsMock.mockResolvedValue({ items: [makeItem()] });
    render(
      <MemoryRouter>
        <ModApprovalsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/please pray for my mother/i)).toBeInTheDocument());
    expect(screen.getByText('Mary Okafor')).toBeInTheDocument();
  });

  it('renders "Anonymous" for an anonymous request, matching the feed', async () => {
    useAuthMock.mockReturnValue({ me: modMe });
    listApprovalsMock.mockResolvedValue({
      items: [makeItem({ display_name: null, is_anonymous: true })],
    });
    render(
      <MemoryRouter>
        <ModApprovalsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Anonymous')).toBeInTheDocument());
    expect(screen.getByLabelText('Anonymous')).toBeInTheDocument();
  });

  it("renders the author's uploaded avatar", async () => {
    useAuthMock.mockReturnValue({ me: modMe });
    listApprovalsMock.mockResolvedValue({
      items: [makeItem({ avatar_url: 'https://cdn.test.local/avatars/u1.webp' })],
    });
    render(
      <MemoryRouter>
        <ModApprovalsPage />
      </MemoryRouter>,
    );
    const img = await screen.findByRole('img', { name: /mary okafor/i });
    expect(img).toHaveAttribute('src', expect.stringContaining('cdn.test.local/avatars/u1.webp'));
  });

  it('renders "Former member" rather than treating a null name as anonymous', async () => {
    useAuthMock.mockReturnValue({ me: modMe });
    listApprovalsMock.mockResolvedValue({
      items: [makeItem({ display_name: null, is_anonymous: false, is_former_member: true })],
    });
    render(
      <MemoryRouter>
        <ModApprovalsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Former member')).toBeInTheDocument());
  });

  it('Approve button calls approve endpoint and removes card', async () => {
    useAuthMock.mockReturnValue({ me: modMe });
    listApprovalsMock.mockResolvedValue({ items: [makeItem()] });
    approvePostMock.mockResolvedValue({ post: makeItem({ status: 'published' }) });
    render(
      <MemoryRouter>
        <ModApprovalsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/please pray for my mother/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    await waitFor(() =>
      expect(screen.queryByText(/please pray for my mother/i)).not.toBeInTheDocument(),
    );
    expect(approvePostMock).toHaveBeenCalledWith('p1');
  });

  it('Decline flow shows back face then calls reject endpoint', async () => {
    useAuthMock.mockReturnValue({ me: modMe });
    listApprovalsMock.mockResolvedValue({ items: [makeItem()] });
    rejectPostMock.mockResolvedValue({ post: makeItem({ status: 'archived' }) });
    render(
      <MemoryRouter>
        <ModApprovalsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/please pray for my mother/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^decline$/i }));
    // Back face shown
    expect(screen.getByText(/declining/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send & decline/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /send & decline/i }));
    await waitFor(() =>
      expect(screen.queryByText(/please pray for my mother/i)).not.toBeInTheDocument(),
    );
    expect(rejectPostMock).toHaveBeenCalledWith('p1', undefined);
  });
});
