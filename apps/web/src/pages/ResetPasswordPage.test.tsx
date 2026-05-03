import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResetPasswordPage } from './ResetPasswordPage';

type Listener = (event: string, session: unknown) => void;
const listeners: Listener[] = [];

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: Listener) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      updateUser: vi.fn(),
    },
  },
}));
const { supabase } = await import('../lib/supabase');

function renderAt(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/auth/reset-password']}>
      <Routes>
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listeners.length = 0;
  vi.clearAllMocks();
});

describe('ResetPasswordPage', () => {
  it('renders the form after PASSWORD_RECOVERY event', async () => {
    renderAt();
    act(() => {
      listeners[0]!('PASSWORD_RECOVERY', { user: { id: 'u1' } });
    });
    await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument());
  });

  it('submit calls updateUser and navigates home', async () => {
    vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce({
      data: { user: { id: 'u1' } } as never,
      error: null,
    });
    renderAt();
    act(() => {
      listeners[0]!('PASSWORD_RECOVERY', { user: { id: 'u1' } });
    });
    await waitFor(() => screen.getByLabelText(/^new password$/i));
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'abcdefgh');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'abcdefgh');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() =>
      expect(vi.mocked(supabase.auth.updateUser)).toHaveBeenCalledWith({
        password: 'abcdefgh',
      }),
    );
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument());
  });

  it('shows mismatch error and blocks submit', async () => {
    renderAt();
    act(() => {
      listeners[0]!('PASSWORD_RECOVERY', { user: { id: 'u1' } });
    });
    await waitFor(() => screen.getByLabelText(/^new password$/i));
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'abcdefgh');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'different');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));
    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    expect(vi.mocked(supabase.auth.updateUser)).not.toHaveBeenCalled();
  });

  it('shows cross-browser hint after 5s without PASSWORD_RECOVERY', () => {
    vi.useFakeTimers();
    try {
      renderAt();
      act(() => {
        vi.advanceTimersByTime(5100);
      });
      expect(screen.getByText(/same browser/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
