import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForgotPasswordPage } from './ForgotPasswordPage';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { resetPasswordForEmail: vi.fn() } },
}));
const { supabase } = await import('../lib/supabase');

function renderAt(path = '/forgot-password'): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('ForgotPasswordPage', () => {
  it('prefills email from ?email=', () => {
    renderAt('/forgot-password?email=alice%40example.com');
    expect(screen.getByLabelText(/email/i)).toHaveValue('alice@example.com');
  });

  it('calls resetPasswordForEmail with the correct redirectTo', async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValueOnce({
      data: {},
      error: null,
    } as never);
    renderAt();
    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() =>
      expect(vi.mocked(supabase.auth.resetPasswordForEmail)).toHaveBeenCalledWith(
        'alice@example.com',
        { redirectTo: expect.stringContaining('/auth/reset-password') },
      ),
    );
  });

  it('advances to the Check-your-email state after submit', async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValueOnce({
      data: {},
      error: null,
    } as never);
    renderAt();
    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => expect(screen.getByText(/we sent an email to/i)).toBeInTheDocument());
    expect(screen.getByText(/alice@example\.com/)).toBeInTheDocument();
  });
});
