import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MyInvitesPage } from './MyInvitesPage';

const fetchMock = vi.fn();
vi.mock('../lib/api', async (orig) => {
  const actual = await orig<typeof import('../lib/api')>();
  return { ...actual, fetchMyInvites: () => fetchMock() };
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('MyInvitesPage', () => {
  it('renders active code with seat counts and joiner list', async () => {
    fetchMock.mockResolvedValueOnce({
      active: [
        {
          id: 'c1',
          code: 'de32s',
          seat_cap: 3,
          seats_remaining: 1,
          is_active: true,
          created_at: '2026-03-01T00:00:00Z',
          redemptions: [
            {
              invitee_id: 'u1',
              invitee_display_name: 'Alice S.',
              redeemed_at: '2026-03-14T00:00:00Z',
            },
            {
              invitee_id: 'u2',
              invitee_display_name: 'Carol D.',
              redeemed_at: '2026-04-02T00:00:00Z',
            },
          ],
        },
      ],
      retired: [],
    });
    render(<MyInvitesPage />);
    await waitFor(() => expect(screen.getByText('de32s')).toBeInTheDocument());
    expect(screen.getByText(/2 of 3 seats used/i)).toBeInTheDocument();
    expect(screen.getByText(/Alice S\./)).toBeInTheDocument();
    expect(screen.getByText(/Carol D\./)).toBeInTheDocument();
    expect(screen.getByText(/Active/)).toBeInTheDocument();
  });

  it('renders a retired code with strikethrough styling', async () => {
    fetchMock.mockResolvedValueOnce({
      active: [],
      retired: [
        {
          id: 'c2',
          code: 'old11',
          seat_cap: 3,
          seats_remaining: 0,
          is_active: false,
          created_at: '2026-01-01T00:00:00Z',
          redemptions: [],
        },
      ],
    });
    render(<MyInvitesPage />);
    await waitFor(() => expect(screen.getByText('old11')).toBeInTheDocument());
    expect(screen.getByText(/Retired/)).toBeInTheDocument();
  });

  it('shows empty state when no codes exist', async () => {
    fetchMock.mockResolvedValueOnce({ active: [], retired: [] });
    render(<MyInvitesPage />);
    await waitFor(() => expect(screen.getByText(/no invite codes yet/i)).toBeInTheDocument());
  });
});
