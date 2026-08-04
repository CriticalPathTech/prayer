import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SignupAccountPage } from './SignupAccountPage';

vi.mock('../lib/api', () => ({ previewInviteCode: vi.fn(), redeemInviteCode: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signUp: vi.fn(), signInWithPassword: vi.fn() } },
}));
const { previewInviteCode, redeemInviteCode } = await import('../lib/api');
const { supabase } = await import('../lib/supabase');

function renderAt(code = 'de32s') {
  return render(
    <MemoryRouter initialEntries={[`/signup/account?code=${code}`]}>
      <Routes>
        <Route path="/signup/account" element={<SignupAccountPage />} />
        <Route path="/signup/check-email" element={<div>CHECK-EMAIL</div>} />
        <Route path="/signup" element={<div>CODE-PAGE</div>} />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Drive the form to the "Already registered" panel — signUp returns a user
 *  with no identities, which is how Supabase reports an existing account. */
async function reachAlreadyRegistered(email = 'alice@example.com') {
  vi.mocked(previewInviteCode).mockResolvedValue({
    status: 'valid',
    invitor_display_name: 'Ben',
    seat_cap: 3,
    seats_remaining: 1,
  } as never);
  vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
    data: { user: { identities: [] } as unknown as never, session: null },
    error: null,
  } as never);
  renderAt();
  await waitFor(() => screen.getByLabelText(/email/i));
  await userEvent.type(screen.getByLabelText(/email/i), email);
  await userEvent.type(screen.getByLabelText(/^password$/i), 'abcdefgh');
  await userEvent.type(screen.getByLabelText(/confirm password/i), 'abcdefgh');
  await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
  await waitFor(() => expect(screen.getByText(/already registered/i)).toBeInTheDocument());
}

beforeEach(() => vi.clearAllMocks());

describe('SignupAccountPage', () => {
  it('redirects to /signup if pre-submit guard sees not_found', async () => {
    vi.mocked(previewInviteCode).mockResolvedValueOnce({ status: 'valid' } as never); // on mount
    vi.mocked(previewInviteCode).mockResolvedValueOnce({ status: 'not_found' } as never); // on submit guard
    renderAt();
    await waitFor(() => screen.getByLabelText(/email/i));
    await userEvent.type(screen.getByLabelText(/email/i), 'a@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'abcdefgh');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'abcdefgh');
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    await waitFor(() => expect(screen.getByText('CODE-PAGE')).toBeInTheDocument());
  });

  it('on successful signUp navigates to /signup/check-email and passes invite_code', async () => {
    vi.mocked(previewInviteCode).mockResolvedValue({
      status: 'valid',
      invitor_display_name: 'Ben',
      seat_cap: 3,
      seats_remaining: 1,
    } as never);
    vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
      data: { user: { identities: [{}] } as unknown as never, session: null },
      error: null,
    } as never);

    renderAt();
    await waitFor(() => screen.getByLabelText(/email/i));
    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'abcdefgh');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'abcdefgh');
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() => expect(screen.getByText('CHECK-EMAIL')).toBeInTheDocument());

    const call = vi.mocked(supabase.auth.signUp).mock.calls[0]![0];
    expect(call).toMatchObject({
      email: 'alice@example.com',
      password: 'abcdefgh',
      options: {
        data: { invite_code: 'de32s' },
        emailRedirectTo: expect.stringContaining('/auth/callback'),
      },
    });
  });

  it('surfaces over_email_send_rate_limit copy', async () => {
    vi.mocked(previewInviteCode).mockResolvedValue({ status: 'valid' } as never);
    vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: 'over_email_send_rate_limit', message: '…' },
    } as never);

    renderAt();
    await waitFor(() => screen.getByLabelText(/email/i));
    await userEvent.type(screen.getByLabelText(/email/i), 'a@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'abcdefgh');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'abcdefgh');
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    await waitFor(() => expect(screen.getByText(/too many sign-up attempts/i)).toBeInTheDocument());
  });

  it('rejects mismatched passwords locally without calling signUp', async () => {
    vi.mocked(previewInviteCode).mockResolvedValue({ status: 'valid' } as never);
    renderAt();
    await waitFor(() => screen.getByLabelText(/email/i));
    await userEvent.type(screen.getByLabelText(/email/i), 'a@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'abcdefgh');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'different1');
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    expect(screen.getByText(/passwords don.t match/i)).toBeInTheDocument();
    expect(vi.mocked(supabase.auth.signUp)).not.toHaveBeenCalled();
  });

  it('shows "already registered" inline when identities is empty', async () => {
    vi.mocked(previewInviteCode).mockResolvedValue({
      status: 'valid',
      invitor_display_name: 'Ben',
      seat_cap: 3,
      seats_remaining: 1,
    } as never);
    // Masked-existing: 2xx but identities === []
    vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
      data: { user: { identities: [] } as unknown as never, session: null },
      error: null,
    } as never);

    renderAt();
    await waitFor(() => screen.getByLabelText(/email/i));
    await userEvent.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'abcdefgh');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'abcdefgh');
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() => expect(screen.getByText(/already registered/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /reset password/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/forgot-password?email=alice%40example.com'),
    );
  });

  // End-to-end through the page: an existing account never gets invite_code
  // written to user_metadata, so /auth/callback never redeems for it. This
  // button is the only path in for a removed-and-re-invited member.
  it('Sign in & join signs the existing account in, redeems the code, and lands home', async () => {
    await reachAlreadyRegistered();
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: { id: 'u1' } as unknown as never, session: {} as never },
      error: null,
    } as never);
    vi.mocked(redeemInviteCode).mockResolvedValueOnce({ user: { id: 'u1' } } as never);

    await userEvent.click(screen.getByRole('button', { name: /sign in & join/i }));

    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument());
    expect(vi.mocked(supabase.auth.signInWithPassword)).toHaveBeenCalledWith({
      email: 'alice@example.com',
      password: 'abcdefgh',
    });
    expect(vi.mocked(redeemInviteCode)).toHaveBeenCalledWith('de32s');
  });

  it('Sign in & join surfaces a wrong-password error and never redeems', async () => {
    await reachAlreadyRegistered();
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    } as never);

    await userEvent.click(screen.getByRole('button', { name: /sign in & join/i }));

    await waitFor(() => expect(screen.getByText(/password is incorrect/i)).toBeInTheDocument());
    expect(vi.mocked(redeemInviteCode)).not.toHaveBeenCalled();
    expect(screen.queryByText('HOME')).not.toBeInTheDocument();
  });

  it('Sign in & join surfaces a full-code error from redeem without navigating', async () => {
    await reachAlreadyRegistered();
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: { id: 'u1' } as unknown as never, session: {} as never },
      error: null,
    } as never);
    vi.mocked(redeemInviteCode).mockRejectedValueOnce({
      code: 'CODE_FULL',
      message: 'no seats left',
    });

    await userEvent.click(screen.getByRole('button', { name: /sign in & join/i }));

    await waitFor(() => expect(screen.queryByText('HOME')).not.toBeInTheDocument());
    expect(vi.mocked(redeemInviteCode)).toHaveBeenCalledWith('de32s');
  });
});
