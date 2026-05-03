import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileForgotPasswordPage } from './MobileForgotPasswordPage';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }) },
  },
}));

const useForgotPasswordMock = vi.fn();
vi.mock('../../hooks/useForgotPassword', () => ({
  useForgotPassword: () => useForgotPasswordMock(),
}));

const baseHook = {
  email: '',
  setEmail: vi.fn(),
  submitting: false,
  sent: false,
  error: null as string | null,
  submit: vi.fn().mockResolvedValue(undefined),
};

describe('MobileForgotPasswordPage', () => {
  beforeEach(() => useForgotPasswordMock.mockReturnValue({ ...baseHook }));
  afterEach(() => vi.clearAllMocks());

  it('renders email field + Send reset link', () => {
    render(
      <MemoryRouter>
        <MobileForgotPasswordPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('renders Check your email panel when sent', () => {
    useForgotPasswordMock.mockReturnValue({ ...baseHook, sent: true, email: 'm@t.local' });
    render(
      <MemoryRouter>
        <MobileForgotPasswordPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument();
  });

  it('shows error from hook', () => {
    useForgotPasswordMock.mockReturnValue({ ...baseHook, error: 'rate limit' });
    render(
      <MemoryRouter>
        <MobileForgotPasswordPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('rate limit')).toBeInTheDocument();
  });

  it('calls submit on button click', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    useForgotPasswordMock.mockReturnValue({ ...baseHook, email: 'm@t.local', submit });
    render(
      <MemoryRouter>
        <MobileForgotPasswordPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(submit).toHaveBeenCalled();
  });
});
