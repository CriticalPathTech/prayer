import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileAuthCallbackPage } from './MobileAuthCallbackPage';

const useAuthCallbackMock = vi.fn();
vi.mock('../../hooks/useAuthCallback', () => ({
  useAuthCallback: () => useAuthCallbackMock(),
}));

describe('MobileAuthCallbackPage', () => {
  beforeEach(() => useAuthCallbackMock.mockReturnValue({ state: 'waiting', message: null }));
  afterEach(() => vi.clearAllMocks());

  it('renders Finishing up while waiting/redeeming', () => {
    render(
      <MemoryRouter>
        <MobileAuthCallbackPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/finishing up/i)).toBeInTheDocument();
  });

  it('renders timeout copy when timeout', () => {
    useAuthCallbackMock.mockReturnValue({ state: 'timeout', message: null });
    render(
      <MemoryRouter>
        <MobileAuthCallbackPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/signed in/i)).toBeInTheDocument();
  });

  it('renders error message when error', () => {
    useAuthCallbackMock.mockReturnValue({ state: 'error', message: 'oops' });
    render(
      <MemoryRouter>
        <MobileAuthCallbackPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('oops')).toBeInTheDocument();
  });
});
