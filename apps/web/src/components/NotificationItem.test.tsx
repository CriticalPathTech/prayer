import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { NotificationItem } from './NotificationItem';

const commentNotif = {
  id: 'n1',
  user_id: 'u',
  type: 'comment.created',
  payload: {
    comment_id: 'c1',
    post_id: 'p1',
    commenter_id: 'commenter',
    commenter_display_name: 'Member One',
    preview: 'praying for you',
  },
  read_at: null,
  created_at: new Date(Date.now() - 3 * 60_000).toISOString(),
};

describe('NotificationItem', () => {
  it('renders commenter name + preview for comment.created', () => {
    render(
      <MemoryRouter>
        <NotificationItem notification={commentNotif} onClick={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Member One/)).toBeInTheDocument();
    expect(screen.getByText(/praying for you/)).toBeInTheDocument();
  });

  it('is a link to /posts/:post_id', () => {
    render(
      <MemoryRouter>
        <NotificationItem notification={commentNotif} onClick={() => {}} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/posts/p1');
  });

  it('calls onClick when the row is clicked', async () => {
    const onClick = vi.fn();
    render(
      <MemoryRouter>
        <NotificationItem notification={commentNotif} onClick={onClick} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('link'));
    expect(onClick).toHaveBeenCalledWith('n1');
  });

  it('renders a generic fallback for unknown types', () => {
    const unknown = { ...commentNotif, id: 'n2', type: 'unknown.type', payload: {} };
    render(
      <MemoryRouter>
        <NotificationItem notification={unknown} onClick={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/new notification/i)).toBeInTheDocument();
  });

  it('renders flag.created with amber accent and link to /mod/queue', () => {
    const n = {
      id: 'n1',
      user_id: 'u',
      type: 'flag.created',
      payload: {
        target_type: 'post',
        reason: 'off_topic',
        target_preview: 'hello',
        post_id: 'p1',
      },
      read_at: null,
      created_at: new Date().toISOString(),
    };
    render(
      <MemoryRouter>
        <NotificationItem notification={n} onClick={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/mod/queue');
  });

  it('renders moderator.hide with link to /posts/:post_id', () => {
    const n = {
      id: 'n2',
      user_id: 'u',
      type: 'moderator.hide',
      payload: { target_type: 'post', post_id: 'p1', source: 'auto' },
      read_at: null,
      created_at: new Date().toISOString(),
    };
    render(
      <MemoryRouter>
        <NotificationItem notification={n} onClick={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/posts/p1');
  });

  it('renders invite.accepted with link to /me/invites', () => {
    const n = {
      id: 'n3',
      user_id: 'u',
      type: 'invite.accepted',
      payload: {
        invitation_id: 'i1',
        invitee_id: 'u2',
        invitee_display_name: 'New Friend',
      },
      read_at: null,
      created_at: new Date().toISOString(),
    };
    render(
      <MemoryRouter>
        <NotificationItem notification={n} onClick={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/me/invites');
    expect(screen.getByText(/New Friend accepted your invite/)).toBeInTheDocument();
  });
});
