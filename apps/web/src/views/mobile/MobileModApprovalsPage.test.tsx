import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileModApprovalsPage } from './MobileModApprovalsPage';

const listApprovalsMock = vi.fn();
const approvePostMock = vi.fn();
const rejectPostMock = vi.fn();
const skipPostMock = vi.fn();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    listApprovals: (...a: unknown[]) => listApprovalsMock(...a),
    approvePost: (...a: unknown[]) => approvePostMock(...a),
    rejectPost: (...a: unknown[]) => rejectPostMock(...a),
    skipPost: (...a: unknown[]) => skipPostMock(...a),
  };
});

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

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
    display_name: 'Ruth Alvarez',
    avatar_url: null,
    status: 'pending',
    is_anonymous: false,
    is_answered_prayer: false,
    body: 'Pray for my family.',
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

describe('MobileModApprovalsPage', () => {
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

  it('redirects when role is not privileged', () => {
    useAuthMock.mockReturnValue({ me: { ...modMe, role: 'member' } });
    listApprovalsMock.mockResolvedValue({ items: [] });
    render(
      <MemoryRouter initialEntries={['/mod/approvals']}>
        <MobileModApprovalsPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Review')).not.toBeInTheDocument();
  });

  it('renders header and empty state', async () => {
    useAuthMock.mockReturnValue({ me: modMe });
    listApprovalsMock.mockResolvedValue({ items: [] });
    render(
      <MemoryRouter>
        <MobileModApprovalsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Review')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/inbox zero/i)).toBeInTheDocument());
  });

  it('renders a pending card for each item', async () => {
    useAuthMock.mockReturnValue({ me: modMe });
    listApprovalsMock.mockResolvedValue({ items: [makeItem()] });
    render(
      <MemoryRouter>
        <MobileModApprovalsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/pray for my family/i)).toBeInTheDocument());
    expect(screen.getByText('Ruth Alvarez')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^decline$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^skip$/i })).toBeInTheDocument();
  });
});
