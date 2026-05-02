import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChangeMemberRoleDialog } from './ChangeMemberRoleDialog';

const member = {
  id: 'm1',
  displayName: 'Alice',
  email: 'alice@x.com',
  avatarUrl: null,
  role: 'member' as const,
  joinedAt: '2026-01-01T00:00:00Z',
};

describe('ChangeMemberRoleDialog', () => {
  it('renders target details + cap status', () => {
    render(
      <ChangeMemberRoleDialog
        member={member}
        superUserCount={1}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    // The current role appears in the member info row (there's also a <select> option with same text).
    expect(screen.getAllByText('member').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1 of 3 super_users used/i)).toBeInTheDocument();
  });

  it('Save disabled when newRole equals current role', () => {
    render(
      <ChangeMemberRoleDialog
        member={member}
        superUserCount={1}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('Save enables on member → moderator (no confirm needed)', async () => {
    const onConfirm = vi.fn();
    render(
      <ChangeMemberRoleDialog
        member={member}
        superUserCount={1}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'moderator');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onConfirm).toHaveBeenCalledWith('moderator');
  });

  it('super_user option is disabled when superUserCount >= 3 and target is not super_user', () => {
    render(
      <ChangeMemberRoleDialog
        member={member}
        superUserCount={3}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const superUserOption = screen.getByRole('option', { name: 'super_user' });
    expect(superUserOption).toBeDisabled();
    expect(screen.getByText(/promote not available/i)).toBeInTheDocument();
  });

  it('Save disabled when demoting the last super_user', async () => {
    const su = { ...member, role: 'super_user' as const };
    render(
      <ChangeMemberRoleDialog
        member={su}
        superUserCount={1}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'moderator');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText(/cannot demote the last super_user/i)).toBeInTheDocument();
  });

  it('promoting to super_user surfaces type-to-confirm; Save gated until match', async () => {
    const onConfirm = vi.fn();
    render(
      <ChangeMemberRoleDialog
        member={member}
        superUserCount={1}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'super_user');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    const confirmInput = screen.getByRole('textbox');
    await userEvent.type(confirmInput, 'wrong@x.com');
    expect(save).toBeDisabled();

    await userEvent.clear(confirmInput);
    await userEvent.type(confirmInput, 'alice@x.com');
    expect(save).toBeEnabled();

    await userEvent.click(save);
    expect(onConfirm).toHaveBeenCalledWith('super_user');
  });

  it('member ↔ moderator transitions do NOT show type-to-confirm', async () => {
    render(
      <ChangeMemberRoleDialog
        member={member}
        superUserCount={1}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'moderator');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('demoting from super_user does NOT show type-to-confirm', async () => {
    const su = { ...member, role: 'super_user' as const };
    render(
      <ChangeMemberRoleDialog
        member={su}
        superUserCount={2}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), 'moderator');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('Cancel calls onCancel', async () => {
    const onCancel = vi.fn();
    render(
      <ChangeMemberRoleDialog
        member={member}
        superUserCount={1}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
