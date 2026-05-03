import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SignupCodePage } from './SignupCodePage';

vi.mock('../lib/api', () => ({
  previewInviteCode: vi.fn(),
}));
const { previewInviteCode } = await import('../lib/api');

function renderAt(path = '/signup'): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/signup" element={<SignupCodePage />} />
        <Route path="/signup/account" element={<div>ACCOUNT</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('SignupCodePage', () => {
  it('navigates straight to /signup/account on a valid code', async () => {
    vi.mocked(previewInviteCode).mockResolvedValueOnce({
      status: 'valid',
      invitor_display_name: 'Ben',
      seat_cap: 3,
      seats_remaining: 1,
    } as never);
    renderAt();
    await userEvent.type(screen.getByLabelText(/invite code/i), 'de32s');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(screen.getByText('ACCOUNT')).toBeInTheDocument());
    expect(screen.queryByText(/invited by/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/seats/i)).not.toBeInTheDocument();
  });

  it('shows "we do not recognize" for not_found', async () => {
    vi.mocked(previewInviteCode).mockResolvedValueOnce({ status: 'not_found' } as never);
    renderAt();
    await userEvent.type(screen.getByLabelText(/invite code/i), 'zzzzz');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(screen.getByText(/don.t recognize that code/i)).toBeInTheDocument());
  });

  it('shows a length error without calling the API when fewer than 5 chars', async () => {
    renderAt();
    await userEvent.type(screen.getByLabelText(/invite code/i), 'abc');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText(/invite codes are 5 characters/i)).toBeInTheDocument();
    expect(vi.mocked(previewInviteCode)).not.toHaveBeenCalled();
  });
});
