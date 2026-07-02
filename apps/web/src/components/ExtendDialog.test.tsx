import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ExtendDialog } from './ExtendDialog';

describe('ExtendDialog', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <ExtendDialog open={false} onCancel={() => {}} onConfirm={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the extend copy, duration picker, and buttons when open', () => {
    render(<ExtendDialog open onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByRole('alertdialog', { name: /extend this prayer/i })).toBeInTheDocument();
    expect(screen.getByText(/keep this prayer visible for/i)).toBeInTheDocument();
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Extend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('swaps to "bring back" copy and button when wasArchived', () => {
    render(<ExtendDialog open wasArchived onCancel={() => {}} onConfirm={() => {}} />);
    expect(
      screen.getByRole('alertdialog', { name: /bring this prayer back/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/return it to the wall/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bring back' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Extend' })).not.toBeInTheDocument();
  });

  it('confirms with the default duration (7 days) when unchanged', async () => {
    const onConfirm = vi.fn();
    render(<ExtendDialog open onCancel={() => {}} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Extend' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(7);
  });

  it('confirms with the duration chosen in the picker', async () => {
    const onConfirm = vi.fn();
    render(<ExtendDialog open onCancel={() => {}} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('radio', { name: /2 weeks/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Extend' }));
    expect(onConfirm).toHaveBeenCalledWith(14);
  });

  it('fires onCancel on the Cancel button, Esc, and backdrop click', async () => {
    const onCancel = vi.fn();
    const { rerender } = render(<ExtendDialog open onCancel={onCancel} onConfirm={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(<ExtendDialog open onCancel={onCancel} onConfirm={() => {}} />);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByTestId('extend-dialog-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('lands initial focus on Cancel', async () => {
    render(<ExtendDialog open onCancel={() => {}} onConfirm={() => {}} />);
    const cancel = screen.getByRole('button', { name: /cancel/i });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
  });

  it('disables both buttons and blocks Esc/backdrop while the confirm is pending', async () => {
    let resolveConfirm!: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    const onCancel = vi.fn();
    render(<ExtendDialog open onCancel={onCancel} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button', { name: 'Extend' }));

    // onConfirm is still pending → dialog is busy
    expect(screen.getByRole('button', { name: 'Extend' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();

    // Esc and backdrop must not cancel while busy
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByTestId('extend-dialog-backdrop'));
    expect(onCancel).not.toHaveBeenCalled();

    // resolving the confirm re-enables the buttons
    await act(async () => {
      resolveConfirm();
    });
    expect(screen.getByRole('button', { name: 'Extend' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).not.toBeDisabled();
  });
});
