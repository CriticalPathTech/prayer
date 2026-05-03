import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FlagModal } from './FlagModal';

describe('FlagModal', () => {
  it('requires a note when reason is "other"', async () => {
    const onSubmit = vi.fn();
    render(<FlagModal open onClose={() => {}} onSubmit={onSubmit} />);
    const otherRadio = screen.getByRole('radio', { name: /other/i });
    await userEvent.click(otherRadio);
    const submit = screen.getByRole('button', { name: /submit/i });
    expect(submit).toBeDisabled();
  });

  it('submits reason + note', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<FlagModal open onClose={() => {}} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('radio', { name: /off-topic/i }));
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith({ reason: 'off_topic' });
  });

  it('moves focus to the first control on open', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = render(<FlagModal open={false} onClose={onClose} onSubmit={onSubmit} />);
    rerender(<FlagModal open={true} onClose={onClose} onSubmit={onSubmit} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).not.toBe(document.body);
  });
});
