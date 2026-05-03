import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CommentForm } from './CommentForm';

describe('CommentForm', () => {
  it('submits body and clears on success', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CommentForm onSubmit={onSubmit} />);
    const area = screen.getByLabelText(/reply|comment/i);
    await userEvent.type(area, 'hello');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect((area as HTMLTextAreaElement).value).toBe('');
  });

  it('rejects empty body without calling onSubmit', async () => {
    const onSubmit = vi.fn();
    render(<CommentForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows error message on submit failure and keeps the text', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Server said no'));
    render(<CommentForm onSubmit={onSubmit} />);
    const area = screen.getByLabelText(/reply|comment/i);
    await userEvent.type(area, 'text');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(await screen.findByText(/server said no/i)).toBeInTheDocument();
    expect((area as HTMLTextAreaElement).value).toBe('text');
  });
});
