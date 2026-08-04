import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileMyInvitesPage } from './MobileMyInvitesPage';

const useAuthMock = vi.fn(() => ({ me: { orgDisplayName: 'Lakeside' } }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const useMyInvitesMock = vi.fn();
vi.mock('../../hooks/useMyInvites', () => ({ useMyInvites: () => useMyInvitesMock() }));

describe('MobileMyInvitesPage', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders Loading state', () => {
    useMyInvitesMock.mockReturnValue({ data: null, loading: true, error: null });
    render(
      <MemoryRouter>
        <MobileMyInvitesPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders empty state when both lists empty', () => {
    useMyInvitesMock.mockReturnValue({
      data: { active: [], retired: [] },
      loading: false,
      error: null,
    });
    render(
      <MemoryRouter>
        <MobileMyInvitesPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no invite codes yet/i)).toBeInTheDocument();
  });

  it('renders an active code with seat usage', () => {
    useMyInvitesMock.mockReturnValue({
      data: {
        active: [
          {
            id: 'c1',
            code: 'ABCD-1234',
            seat_cap: 5,
            seats_remaining: 3,
            is_active: true,
            redemptions: [],
          },
        ],
        retired: [],
      },
      loading: false,
      error: null,
    });
    render(
      <MemoryRouter>
        <MobileMyInvitesPage />
      </MemoryRouter>,
    );
    // The code appears twice now: the code chip, and inside the email template body.
    expect(screen.getAllByText(/ABCD-1234/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 of 5 seats used/i)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('offers the email template for a code with seats remaining', () => {
    useMyInvitesMock.mockReturnValue({
      data: {
        active: [
          {
            id: 'c1',
            code: 'ABCD-1234',
            seat_cap: 5,
            seats_remaining: 3,
            is_active: true,
            created_at: '2026-03-01T00:00:00Z',
            redemptions: [],
          },
        ],
        retired: [],
      },
      loading: false,
      error: null,
    });
    render(
      <MemoryRouter>
        <MobileMyInvitesPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Email template')).toBeInTheDocument();
  });

  it('renders error from hook', () => {
    useMyInvitesMock.mockReturnValue({ data: null, loading: false, error: 'boom' });
    render(
      <MemoryRouter>
        <MobileMyInvitesPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});
