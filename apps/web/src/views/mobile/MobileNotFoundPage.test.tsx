import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileNotFoundPage } from './MobileNotFoundPage';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

describe('MobileNotFoundPage', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders Not found header + body', () => {
    render(
      <MemoryRouter>
        <MobileNotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
    expect(
      screen.getByText(/couldn't find that page|couldn't find that page/i),
    ).toBeInTheDocument();
  });

  it('Go home button navigates to /', async () => {
    render(
      <MemoryRouter>
        <MobileNotFoundPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /go home/i }));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('Close button in header navigates to /', async () => {
    render(
      <MemoryRouter>
        <MobileNotFoundPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });
});
