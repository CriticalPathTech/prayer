import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileSignupAccountPage } from './MobileSignupAccountPage';

const useSignupAccountMock = vi.fn();
vi.mock('../../hooks/useSignupAccount', () => ({
  useSignupAccount: () => useSignupAccountMock(),
}));

const baseHook = {
  preview: { kind: 'ok', preview: { status: 'valid' } } as const,
  email: '',
  password: '',
  confirm: '',
  setEmail: vi.fn(),
  setPassword: vi.fn(),
  setConfirm: vi.fn(),
  passwordError: null as string | null,
  formError: null as string | null,
  submitting: false,
  alreadyRegistered: false,
  submit: vi.fn().mockResolvedValue(undefined),
};

describe('MobileSignupAccountPage', () => {
  beforeEach(() => useSignupAccountMock.mockReturnValue({ ...baseHook }));
  afterEach(() => vi.clearAllMocks());

  it("renders Loading when preview.kind === 'loading'", () => {
    useSignupAccountMock.mockReturnValue({ ...baseHook, preview: { kind: 'loading' } });
    render(
      <MemoryRouter>
        <MobileSignupAccountPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/checking your invite/i)).toBeInTheDocument();
  });

  it("renders error message when preview.kind === 'error'", () => {
    useSignupAccountMock.mockReturnValue({
      ...baseHook,
      preview: { kind: 'error', message: 'bad code' },
    });
    render(
      <MemoryRouter>
        <MobileSignupAccountPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('bad code')).toBeInTheDocument();
  });

  it('renders Already registered when alreadyRegistered is true', () => {
    useSignupAccountMock.mockReturnValue({ ...baseHook, alreadyRegistered: true });
    render(
      <MemoryRouter>
        <MobileSignupAccountPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/already registered/i)).toBeInTheDocument();
  });

  it('renders the form (email + password + confirm + Sign up) on ok preview', () => {
    render(
      <MemoryRouter>
        <MobileSignupAccountPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
  });

  it('calls submit on button click', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    useSignupAccountMock.mockReturnValue({
      ...baseHook,
      email: 'm@t.local',
      password: 'aaaaaaaa',
      confirm: 'aaaaaaaa',
      submit,
    });
    render(
      <MemoryRouter>
        <MobileSignupAccountPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    expect(submit).toHaveBeenCalled();
  });
});
