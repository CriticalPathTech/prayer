import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SecurityPage } from './SecurityPage';

const useAuthMock = vi.fn();
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      updateUser: vi.fn(),
    },
  },
}));
const { supabase } = await import('../lib/supabase');

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <SecurityPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({
    me: { id: 'u1', email: 'alice@e.com', displayName: 'Alice', role: 'member' },
  });
});

describe('SecurityPage', () => {
  it('blocks submit when new and confirm do not match', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/current password/i), 'oldpass12');
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'abcdefgh');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'different');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));
    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    expect(vi.mocked(supabase.auth.signInWithPassword)).not.toHaveBeenCalled();
  });

  it('shows error when current password is wrong', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null } as never,
      error: { code: 'invalid_credentials', message: 'nope' } as never,
    });
    renderPage();
    await userEvent.type(screen.getByLabelText(/current password/i), 'wrongpass');
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'abcdefgh');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'abcdefgh');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() =>
      expect(screen.getByText(/current password is incorrect/i)).toBeInTheDocument(),
    );
    expect(vi.mocked(supabase.auth.updateUser)).not.toHaveBeenCalled();
  });

  it('happy path: verifies current then updates', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: { id: 'u1' }, session: {} } as never,
      error: null,
    });
    vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce({
      data: { user: { id: 'u1' } } as never,
      error: null,
    });
    renderPage();
    await userEvent.type(screen.getByLabelText(/current password/i), 'correctpw');
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'newvalid1');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'newvalid1');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() =>
      expect(vi.mocked(supabase.auth.signInWithPassword)).toHaveBeenCalledWith({
        email: 'alice@e.com',
        password: 'correctpw',
      }),
    );
    await waitFor(() =>
      expect(vi.mocked(supabase.auth.updateUser)).toHaveBeenCalledWith({
        password: 'newvalid1',
      }),
    );
    await waitFor(() => expect(screen.getByText(/password updated/i)).toBeInTheDocument());
  });
});
