import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { MobileAdminChurchPage } from './MobileAdminChurchPage';

describe('MobileAdminChurchPage', () => {
  it('renders desktop-only message with the current host URL', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'hopechurch.prays.online' },
      writable: true,
    });
    render(
      <MemoryRouter>
        <MobileAdminChurchPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/desktop only/i)).toBeInTheDocument();
    expect(screen.getByText(/hopechurch\.prays\.online\/admin\/church/i)).toBeInTheDocument();
  });
});
