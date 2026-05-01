import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RemoveMemberDialog } from './RemoveMemberDialog';

const member = {
  id: 'm1',
  displayName: 'Alice',
  email: 'alice@x.com',
  avatarUrl: null,
  role: 'member' as const,
  joinedAt: '2026-01-01T00:00:00Z',
};

describe('RemoveMemberDialog', () => {
  it('renders target details and disables Remove until email matches', async () => {
    const onConfirm = vi.fn();
    render(<RemoveMemberDialog member={member} onConfirm={onConfirm} onCancel={() => {}} />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    // Email appears twice: once in the member info row, once in the type-to-confirm label.
    expect(screen.getAllByText('alice@x.com').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('member')).toBeInTheDocument();

    const removeBtn = screen.getByRole('button', { name: /remove/i });
    expect(removeBtn).toBeDisabled();

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'wrong@x.com');
    expect(removeBtn).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, 'alice@x.com');
    expect(removeBtn).toBeEnabled();

    await userEvent.click(removeBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Cancel button calls onCancel', async () => {
    const onCancel = vi.fn();
    render(<RemoveMemberDialog member={member} onConfirm={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows "Removing…" when removing prop is true and disables Remove', () => {
    render(
      <RemoveMemberDialog member={member} onConfirm={() => {}} onCancel={() => {}} removing />,
    );
    expect(screen.getByRole('button', { name: /removing/i })).toBeDisabled();
  });
});
