import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthCallbackPage } from './AuthCallbackPage';

type Listener = (event: string, session: unknown) => void;
const listeners: Listener[] = [];

vi.mock('../lib/api', () => ({ redeemInviteCode: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: Listener) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getSession: vi.fn(),
    },
  },
}));

const { redeemInviteCode } = await import('../lib/api');
const { supabase } = await import('../lib/supabase');

function renderAt(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/auth/callback']}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listeners.length = 0;
  vi.clearAllMocks();
});

describe('AuthCallbackPage', () => {
  it('calls redeem and navigates home on SIGNED_IN with invite_code in metadata', async () => {
    vi.mocked(redeemInviteCode).mockResolvedValueOnce({ user: { id: '1' } } as never);
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
    } as never);
    renderAt();
    act(() => {
      listeners[0]!('SIGNED_IN', { user: { user_metadata: { invite_code: 'de32s' } } });
    });
    await waitFor(() => expect(vi.mocked(redeemInviteCode)).toHaveBeenCalledWith('de32s'));
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument());
  });

  it('shows code_full message on 409 CODE_FULL', async () => {
    vi.mocked(redeemInviteCode).mockRejectedValueOnce({ code: 'CODE_FULL' });
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
    } as never);
    renderAt();
    act(() => {
      listeners[0]!('SIGNED_IN', { user: { user_metadata: { invite_code: 'de32s' } } });
    });
    await waitFor(() => expect(screen.getByText(/just filled up/i)).toBeInTheDocument());
  });

  it('shows cross-browser hint after 5s with no SIGNED_IN', () => {
    vi.useFakeTimers();
    try {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
      } as never);
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
