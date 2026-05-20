import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { MobileModFollowupPage } from './MobileModFollowupPage';

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

describe('MobileModFollowupPage', () => {
  it('renders the Follow-up header and the search panel', () => {
    useAuthMock.mockReturnValue({
      me: { id: 'm', role: 'moderator', orgRequiresPostApproval: false },
    });
    render(
      <MemoryRouter initialEntries={['/mod/follow-up']}>
        <MobileModFollowupPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Follow-up')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^search$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stale 14 days' })).toBeInTheDocument();
  });

  it('does not render the ModTabs nav (drawer-only navigation on mobile)', () => {
    useAuthMock.mockReturnValue({
      me: { id: 'm', role: 'moderator', orgRequiresPostApproval: false },
    });
    render(
      <MemoryRouter initialEntries={['/mod/follow-up']}>
        <MobileModFollowupPage />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: /^invites$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^flagged$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^hidden$/i })).not.toBeInTheDocument();
  });
});
