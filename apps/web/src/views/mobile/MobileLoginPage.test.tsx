import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileLoginPage } from './MobileLoginPage';

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const useLoginMock = vi.fn();
vi.mock('../../hooks/useLogin', () => ({ useLogin: () => useLoginMock() }));

const useOrgBrandingMock = vi.fn();
vi.mock('../../hooks/useOrgBranding', () => ({ useOrgBranding: () => useOrgBrandingMock() }));

const baseHook = {
  email: '',
  password: '',
  setEmail: vi.fn(),
  setPassword: vi.fn(),
  submitting: false,
  errorMessage: null as string | null,
  submit: vi.fn().mockResolvedValue(undefined),
};

describe('MobileLoginPage', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ session: null, loading: false, needsOnboarding: false });
    useLoginMock.mockReturnValue({ ...baseHook });
    useOrgBrandingMock.mockReturnValue({ displayName: null });
  });
  afterEach(() => vi.clearAllMocks());

  it('renders Prayer brand + email + password + Sign in', () => {
    render(
      <MemoryRouter>
        <MobileLoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Prayer')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('uses a short display name as the wordmark verbatim', () => {
    useOrgBrandingMock.mockReturnValue({ displayName: 'Hope Church' });
    render(
      <MemoryRouter>
        <MobileLoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Hope Church')).toBeInTheDocument();
    // "Prayer" wordmark is replaced by the church name on a known host.
    expect(screen.queryByText('Prayer')).not.toBeInTheDocument();
  });

  it('collapses a long display name to the first word (matches nav)', () => {
    useOrgBrandingMock.mockReturnValue({ displayName: 'HopeChurch Christian Church' });
    render(
      <MemoryRouter>
        <MobileLoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('HopeChurch')).toBeInTheDocument();
    expect(screen.queryByText('HopeChurch Christian Church')).not.toBeInTheDocument();
  });

  it('falls back to the Prayer wordmark when the host is unknown', () => {
    useOrgBrandingMock.mockReturnValue({ displayName: null });
    render(
      <MemoryRouter>
        <MobileLoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Prayer')).toBeInTheDocument();
  });

  it('shows error from hook', () => {
    useLoginMock.mockReturnValue({ ...baseHook, errorMessage: 'wrong' });
    render(
      <MemoryRouter>
        <MobileLoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('wrong')).toBeInTheDocument();
  });

  it('calls submit on button click', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    useLoginMock.mockReturnValue({
      ...baseHook,
      email: 'm@t.local',
      password: 'hunter2',
      submit,
    });
    render(
      <MemoryRouter>
        <MobileLoginPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(submit).toHaveBeenCalled();
  });

  it('renders Forgot password and Sign up links', () => {
    render(
      <MemoryRouter>
        <MobileLoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /forgot/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/signup');
  });
});
