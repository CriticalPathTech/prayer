import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Delete?"
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title, body, and buttons when open', () => {
    render(
      <ConfirmDialog
        open
        title="Delete post?"
        body="This can't be undone."
        confirmLabel="Delete"
        cancelLabel="Keep"
        destructive
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('alertdialog', { name: /delete post\?/i })).toBeInTheDocument();
    expect(screen.getByText(/can't be undone/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument();
  });

  it('fires onConfirm on the Confirm button', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open title="t" confirmLabel="OK" onConfirm={onConfirm} onCancel={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel on the Cancel button, Esc, and backdrop click', async () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmDialog open title="t" confirmLabel="OK" onConfirm={() => {}} onCancel={onCancel} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(
      <ConfirmDialog open title="t" confirmLabel="OK" onConfirm={() => {}} onCancel={onCancel} />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByTestId('confirm-dialog-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('lands initial focus on Confirm when destructive', async () => {
    render(
      <ConfirmDialog
        open
        title="t"
        confirmLabel="Delete"
        destructive
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    await screen.findByRole('button', { name: 'Delete' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }));
  });

  it('disables both buttons while busy', () => {
    render(
      <ConfirmDialog
        open
        title="t"
        confirmLabel="OK"
        busy
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'OK' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });
});
