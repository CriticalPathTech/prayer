import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ModTabs } from './ModTabs';

const useAuthMock = vi.fn();
vi.mock('../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

function meBase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm',
    email: 'm@b',
    displayName: 'Mod',
    avatarUrl: null,
    role: 'moderator' as const,
    orgRequiresPostApproval: false,
    ...overrides,
  };
}

describe('ModTabs', () => {
  it('tab label is "Flagged" (not "Queue") for /mod/queue', () => {
    useAuthMock.mockReturnValue({ me: meBase() });
    render(
      <MemoryRouter initialEntries={['/mod/queue']}>
        <ModTabs />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /flagged/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^queue$/i })).not.toBeInTheDocument();
  });

  it('underlines the Flagged tab when on /mod/queue', () => {
    useAuthMock.mockReturnValue({ me: meBase() });
    render(
      <MemoryRouter initialEntries={['/mod/queue']}>
        <ModTabs />
      </MemoryRouter>,
    );
    const flagged = screen.getByRole('link', { name: /flagged/i });
    expect(flagged.className).toMatch(/underline/);
    const invites = screen.getByRole('link', { name: /invites/i });
    expect(invites.className).not.toMatch(/underline/);
  });

  it('underlines the Invites tab when on /mod/invites', () => {
    useAuthMock.mockReturnValue({ me: meBase() });
    render(
      <MemoryRouter initialEntries={['/mod/invites']}>
        <ModTabs />
      </MemoryRouter>,
    );
    const invites = screen.getByRole('link', { name: /invites/i });
    expect(invites.className).toMatch(/underline/);
  });

  it('hides "Pending approval" tab when orgRequiresPostApproval is false', () => {
    useAuthMock.mockReturnValue({ me: meBase({ orgRequiresPostApproval: false }) });
    render(
      <MemoryRouter initialEntries={['/mod/queue']}>
        <ModTabs />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: /pending approval/i })).not.toBeInTheDocument();
  });

  it('shows "Pending approval" tab when orgRequiresPostApproval is true', () => {
    useAuthMock.mockReturnValue({ me: meBase({ orgRequiresPostApproval: true }) });
    render(
      <MemoryRouter initialEntries={['/mod/queue']}>
        <ModTabs />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /pending approval/i })).toBeInTheDocument();
  });

  it('underlines "Pending approval" tab when on /mod/approvals', () => {
    useAuthMock.mockReturnValue({ me: meBase({ orgRequiresPostApproval: true }) });
    render(
      <MemoryRouter initialEntries={['/mod/approvals']}>
        <ModTabs />
      </MemoryRouter>,
    );
    const tab = screen.getByRole('link', { name: /pending approval/i });
    expect(tab.className).toMatch(/underline/);
  });
});
