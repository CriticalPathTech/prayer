import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileSignupCodePage } from './MobileSignupCodePage';

const useSignupCodeMock = vi.fn();
vi.mock('../../hooks/useSignupCode', () => ({ useSignupCode: () => useSignupCodeMock() }));

const baseHook = {
  code: '',
  setCode: vi.fn(),
  submitting: false,
  error: null as string | null,
  submit: vi.fn().mockResolvedValue(undefined),
};

describe('MobileSignupCodePage', () => {
  beforeEach(() => useSignupCodeMock.mockReturnValue({ ...baseHook }));
  afterEach(() => vi.clearAllMocks());

  it('renders Prayer brand + invite-code field + Continue', () => {
    render(
      <MemoryRouter>
        <MobileSignupCodePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Prayer')).toBeInTheDocument();
    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('shows error from hook', () => {
    useSignupCodeMock.mockReturnValue({ ...baseHook, error: 'bad code' });
    render(
      <MemoryRouter>
        <MobileSignupCodePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('bad code')).toBeInTheDocument();
  });

  it('calls submit on button click', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    useSignupCodeMock.mockReturnValue({ ...baseHook, submit });
    render(
      <MemoryRouter>
        <MobileSignupCodePage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(submit).toHaveBeenCalled();
  });

  it('renders Sign in link', () => {
    render(
      <MemoryRouter>
        <MobileSignupCodePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });
});
