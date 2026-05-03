import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileResetPasswordPage } from './MobileResetPasswordPage';

const useResetPasswordMock = vi.fn();
vi.mock('../../hooks/useResetPassword', () => ({
  useResetPassword: () => useResetPasswordMock(),
}));

const baseHook = {
  state: 'ready' as const,
  next: '',
  confirm: '',
  setNext: vi.fn(),
  setConfirm: vi.fn(),
  error: null as string | null,
  submit: vi.fn().mockResolvedValue(undefined),
};

describe('MobileResetPasswordPage', () => {
  beforeEach(() => useResetPasswordMock.mockReturnValue({ ...baseHook }));
  afterEach(() => vi.clearAllMocks());

  it('renders Finishing up… while waiting', () => {
    useResetPasswordMock.mockReturnValue({ ...baseHook, state: 'waiting' });
    render(
      <MemoryRouter>
        <MobileResetPasswordPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/finishing up/i)).toBeInTheDocument();
  });

  it('renders timeout message when timeout', () => {
    useResetPasswordMock.mockReturnValue({ ...baseHook, state: 'timeout' });
    render(
      <MemoryRouter>
        <MobileResetPasswordPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/didn.?t connect/i)).toBeInTheDocument();
  });

  it('renders the reset form when ready', () => {
    render(
      <MemoryRouter>
        <MobileResetPasswordPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument();
  });

  it('calls submit on button click', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    useResetPasswordMock.mockReturnValue({
      ...baseHook,
      next: 'aaaaaaaa',
      confirm: 'aaaaaaaa',
      submit,
    });
    render(
      <MemoryRouter>
        <MobileResetPasswordPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));
    expect(submit).toHaveBeenCalled();
  });
});
