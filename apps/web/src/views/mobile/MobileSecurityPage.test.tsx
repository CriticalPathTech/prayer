import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileSecurityPage } from './MobileSecurityPage';

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const useChangePasswordMock = vi.fn();
vi.mock('../../hooks/useChangePassword', () => ({
  useChangePassword: () => useChangePasswordMock(),
}));

const baseHook = {
  current: '',
  next: '',
  confirm: '',
  setCurrent: vi.fn(),
  setNext: vi.fn(),
  setConfirm: vi.fn(),
  submitting: false,
  error: null as string | null,
  ok: false,
  submit: vi.fn().mockResolvedValue(undefined),
};

describe('MobileSecurityPage', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      me: { id: 'me', email: 'm@t.local', displayName: 'Mary', avatarUrl: null, role: 'member' },
    });
    useChangePasswordMock.mockReturnValue({ ...baseHook });
  });
  afterEach(() => vi.clearAllMocks());

  it('renders Security header + Change password section', () => {
    render(
      <MemoryRouter>
        <MobileSecurityPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText(/change password/i)).toBeInTheDocument();
  });

  it('renders three password inputs', () => {
    render(
      <MemoryRouter>
        <MobileSecurityPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  });

  it('shows error from hook', () => {
    useChangePasswordMock.mockReturnValue({ ...baseHook, error: 'wrong password' });
    render(
      <MemoryRouter>
        <MobileSecurityPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/wrong password/i)).toBeInTheDocument();
  });

  it('shows success status when ok', () => {
    useChangePasswordMock.mockReturnValue({ ...baseHook, ok: true });
    render(
      <MemoryRouter>
        <MobileSecurityPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/password updated/i);
  });

  it('calls submit() on submit button click', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    useChangePasswordMock.mockReturnValue({ ...baseHook, submit });
    render(
      <MemoryRouter>
        <MobileSecurityPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));
    expect(submit).toHaveBeenCalled();
  });
});
