import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckEmailPage } from './CheckEmailPage';

vi.mock('../lib/supabase', () => ({ supabase: { auth: { resend: vi.fn() } } }));
const { supabase } = await import('../lib/supabase');

function renderAt(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/signup/check-email?email=alice@example.com&code=de32s']}>
      <Routes>
        <Route path="/signup/check-email" element={<CheckEmailPage />} />
        <Route path="/signup/account" element={<div>ACCOUNT</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CheckEmailPage', () => {
  it('renders the email', () => {
    renderAt();
    expect(screen.getByText(/alice@example\.com/)).toBeInTheDocument();
  });

  it('calls supabase.auth.resend on Resend click and disables the button', async () => {
    vi.mocked(supabase.auth.resend).mockResolvedValueOnce({ error: null } as never);
    renderAt();
    await userEvent.click(screen.getByRole('button', { name: /resend/i }));
    expect(vi.mocked(supabase.auth.resend)).toHaveBeenCalledWith({
      type: 'signup',
      email: 'alice@example.com',
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /resend/i })).toBeDisabled());
  });

  it('over_email_send_rate_limit shows a wait message', async () => {
    vi.mocked(supabase.auth.resend).mockResolvedValueOnce({
      error: { code: 'over_email_send_rate_limit', message: '…' },
    } as never);
    renderAt();
    await userEvent.click(screen.getByRole('button', { name: /resend/i }));
    await waitFor(() => expect(screen.getByText(/wait a few minutes/i)).toBeInTheDocument());
  });
});
