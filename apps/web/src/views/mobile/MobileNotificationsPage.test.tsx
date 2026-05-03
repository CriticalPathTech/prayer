import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileNotificationsPage } from './MobileNotificationsPage';

const useNotificationsMock = vi.fn();
vi.mock('../../hooks/useNotifications', () => ({ useNotifications: () => useNotificationsMock() }));

const todayIso = new Date().toISOString();
const earlierIso = new Date(Date.now() - 4 * 24 * 3600_000).toISOString();

describe('MobileNotificationsPage', () => {
  beforeEach(() => {
    useNotificationsMock.mockReturnValue({
      items: [
        {
          id: 'n1',
          user_id: 'u1',
          type: 'comment.created',
          payload: {
            comment_id: 'c1',
            post_id: 'p1',
            commenter_display_name: 'X',
            preview: 'commented',
          },
          read_at: null,
          created_at: todayIso,
        },
        {
          id: 'n2',
          user_id: 'u1',
          type: 'invite.accepted',
          payload: { invitation_id: 'i1', invitee_id: 'u2', invitee_display_name: 'Y' },
          read_at: earlierIso,
          created_at: earlierIso,
        },
      ],
      loading: false,
      error: null,
      unreadCount: 1,
      fetchList: vi.fn().mockResolvedValue(undefined),
      markAllRead: vi.fn().mockResolvedValue(undefined),
      markRead: vi.fn().mockResolvedValue(undefined),
    });
  });
  afterEach(() => vi.clearAllMocks());

  it('renders Notifications header (back variant) with Mark all read', () => {
    render(
      <MemoryRouter>
        <MobileNotificationsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark all read/i })).toBeInTheDocument();
  });

  it('groups items into Today and Earlier sections', () => {
    render(
      <MemoryRouter>
        <MobileNotificationsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/today/i)).toBeInTheDocument();
    expect(screen.getByText(/earlier/i)).toBeInTheDocument();
    // n1 is comment.created today
    expect(screen.getByText(/X commented on your request/i)).toBeInTheDocument();
    // n2 is invite.accepted earlier
    expect(screen.getByText(/Y accepted your invite/i)).toBeInTheDocument();
  });

  it('Mark all read calls hook', async () => {
    const markAllRead = vi.fn().mockResolvedValue(undefined);
    useNotificationsMock.mockReturnValue({
      items: [],
      loading: false,
      error: null,
      unreadCount: 0,
      fetchList: vi.fn().mockResolvedValue(undefined),
      markAllRead,
      markRead: vi.fn(),
    });
    render(
      <MemoryRouter>
        <MobileNotificationsPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    await waitFor(() => expect(markAllRead).toHaveBeenCalled());
  });

  it('shows empty-state copy when items are empty', () => {
    useNotificationsMock.mockReturnValue({
      items: [],
      loading: false,
      error: null,
      unreadCount: 0,
      fetchList: vi.fn().mockResolvedValue(undefined),
      markAllRead: vi.fn(),
      markRead: vi.fn(),
    });
    render(
      <MemoryRouter>
        <MobileNotificationsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument();
  });
});
