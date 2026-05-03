import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckEmailPanel } from './CheckEmailPanel';

beforeEach(() => vi.clearAllMocks());

describe('CheckEmailPanel', () => {
  it('renders the email address', () => {
    render(<CheckEmailPanel email="alice@example.com" resendFn={vi.fn()} />);
    expect(screen.getByText(/alice@example\.com/)).toBeInTheDocument();
  });

  it('calls resendFn on Resend click and disables the button', async () => {
    const resendFn = vi.fn().mockResolvedValue({ error: null });
    render(<CheckEmailPanel email="alice@example.com" resendFn={resendFn} />);
    await userEvent.click(screen.getByRole('button', { name: /resend/i }));
    expect(resendFn).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: /resend/i })).toBeDisabled());
  });

  it('shows the rate-limit copy on over_email_send_rate_limit', async () => {
    const resendFn = vi.fn().mockResolvedValue({
      error: { code: 'over_email_send_rate_limit', message: '…' },
    });
    render(<CheckEmailPanel email="alice@example.com" resendFn={resendFn} />);
    await userEvent.click(screen.getByRole('button', { name: /resend/i }));
    await waitFor(() => expect(screen.getByText(/wait a few minutes/i)).toBeInTheDocument());
  });
});
