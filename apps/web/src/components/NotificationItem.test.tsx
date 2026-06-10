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

  it('renders post.extended copy with the duration label and links to the post', () => {
    const n = {
      id: 'n3',
      user_id: 'u',
      type: 'post.extended',
      payload: { post_id: 'p9', duration_days: 14, was_archived: false },
      read_at: null,
      created_at: new Date().toISOString(),
    };
    render(
      <MemoryRouter>
        <NotificationItem notification={n} onClick={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/extended your prayer for another 2 weeks/i)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/posts/p9');
  });

  it('renders post.extended "brought back" copy when the prayer was archived', () => {
    const n = {
      id: 'n4',
      user_id: 'u',
      type: 'post.extended',
      payload: { post_id: 'p9', duration_days: 7, was_archived: true },
      read_at: null,
      created_at: new Date().toISOString(),
    };
    render(
      <MemoryRouter>
        <NotificationItem notification={n} onClick={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/brought your prayer back for another 1 week/i)).toBeInTheDocument();
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

  describe('post.rejected', () => {
    const baseRejectedNotif = {
      id: 'n-rej',
      user_id: 'u',
      type: 'post.rejected',
      payload: {
        post_id: 'p1',
        moderation_note: null,
        moderated_by: 'mod-user-id',
        body_preview: 'Please pray for my family',
      },
      read_at: null,
      created_at: new Date().toISOString(),
    };

    it('renders the rejection title', () => {
      render(
        <MemoryRouter>
          <NotificationItem notification={baseRejectedNotif} onClick={() => {}} />
        </MemoryRouter>,
      );
      expect(screen.getByText(/a moderator declined your prayer request/i)).toBeInTheDocument();
    });

    it('includes body_preview in meta', () => {
      render(
        <MemoryRouter>
          <NotificationItem notification={baseRejectedNotif} onClick={() => {}} />
        </MemoryRouter>,
      );
      expect(screen.getByText(/Please pray for my family/)).toBeInTheDocument();
    });

    it('includes moderation_note when non-null', () => {
      const n = {
        ...baseRejectedNotif,
        payload: { ...baseRejectedNotif.payload, moderation_note: 'Off topic' },
      };
      render(
        <MemoryRouter>
          <NotificationItem notification={n} onClick={() => {}} />
        </MemoryRouter>,
      );
      expect(screen.getByText(/Off topic/)).toBeInTheDocument();
    });

    it('omits moderation_note section when null', () => {
      render(
        <MemoryRouter>
          <NotificationItem notification={baseRejectedNotif} onClick={() => {}} />
        </MemoryRouter>,
      );
      expect(screen.queryByText(/Off topic/)).not.toBeInTheDocument();
    });

    it('links to /me/archive', () => {
      render(
        <MemoryRouter>
          <NotificationItem notification={baseRejectedNotif} onClick={() => {}} />
        </MemoryRouter>,
      );
      expect(screen.getByRole('link')).toHaveAttribute('href', '/me/archive');
    });

    it('calls onClick with notification id when clicked', async () => {
      const onClick = vi.fn();
      render(
        <MemoryRouter>
          <NotificationItem notification={baseRejectedNotif} onClick={onClick} />
        </MemoryRouter>,
      );
      await userEvent.click(screen.getByRole('link'));
      expect(onClick).toHaveBeenCalledWith('n-rej');
    });
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
