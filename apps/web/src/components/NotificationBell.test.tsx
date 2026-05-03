import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NotificationBell } from './NotificationBell';

describe('NotificationBell', () => {
  it('has accessible name "notifications" when unreadCount is 0', () => {
    render(<NotificationBell unreadCount={0} onClick={() => {}} open={false} />);
    const btn = screen.getByRole('button', { name: /^notifications$/i });
    expect(btn).toBeInTheDocument();
  });

  it('announces the unread count in the accessible name', () => {
    render(<NotificationBell unreadCount={3} onClick={() => {}} open={false} />);
    expect(screen.getByRole('button', { name: /3 unread/i })).toBeInTheDocument();
  });

  it('still renders a single button for counts above 9 (no count cap in a11y label)', () => {
    render(<NotificationBell unreadCount={42} onClick={() => {}} open={false} />);
    expect(screen.getByRole('button', { name: /42 unread/i })).toBeInTheDocument();
  });

  it('fires onClick', async () => {
    const onClick = vi.fn();
    render(<NotificationBell unreadCount={1} onClick={onClick} open={false} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});
