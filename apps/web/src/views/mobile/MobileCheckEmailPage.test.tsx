import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { MobileCheckEmailPage } from './MobileCheckEmailPage';

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { resend: vi.fn().mockResolvedValue({ error: null }) } },
}));

describe('MobileCheckEmailPage', () => {
  it('renders Prayer brand + Check your email heading', () => {
    render(
      <MemoryRouter initialEntries={['/signup/check-email?email=m%40t.local&code=abcde']}>
        <MobileCheckEmailPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Prayer')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument();
  });

  it('renders go-back link with the code preserved', () => {
    render(
      <MemoryRouter initialEntries={['/signup/check-email?email=m%40t.local&code=abcde']}>
        <MobileCheckEmailPage />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /wrong email/i });
    expect(link).toHaveAttribute('href', '/signup/account?code=abcde');
  });
});
