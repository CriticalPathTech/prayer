import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileLayout, type MobileLayoutContext } from './MobileLayout';

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

function ChildProbe() {
  const ctx = useOutletContext<MobileLayoutContext>();
  return (
    <button type="button" onClick={ctx.openDrawer}>
      open
    </button>
  );
}

describe('MobileLayout', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'sb' } },
      me: { id: 'me', email: 'm@t.local', displayName: 'Mary', role: 'member' as const },
      loading: false,
      signOut: vi.fn(),
    });
  });
  afterEach(() => vi.clearAllMocks());

  it('renders the outlet child', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<MobileLayout />}>
            <Route index element={<div>child</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('exposes openDrawer via outlet context; opens the drawer when called', async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<MobileLayout />}>
            <Route index element={<ChildProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('navigation', { name: /menu/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('open'));
    expect(screen.getByRole('navigation', { name: /menu/i })).toBeInTheDocument();
  });

  it('drawer closes when scrim is clicked', async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<MobileLayout />}>
            <Route index element={<ChildProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByText('open'));
    expect(screen.getByRole('navigation', { name: /menu/i })).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mobile-drawer-scrim'));
    expect(screen.queryByRole('navigation', { name: /menu/i })).not.toBeInTheDocument();
  });
});
