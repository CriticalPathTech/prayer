import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModFollowupPage } from './ModFollowupPage';

const getFollowupPostsMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, getFollowupPosts: (...a: unknown[]) => getFollowupPostsMock(...a) };
});

const useAuthMock = vi.fn();
vi.mock('../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const modMe = {
  id: 'm',
  email: 'm@b',
  displayName: 'Mod',
  avatarUrl: null,
  role: 'moderator' as const,
  orgRequiresPostApproval: false,
};

function harness(initialUrl = '/mod/follow-up'): JSX.Element {
  return (
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/mod/follow-up" element={<ModFollowupPage />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  getFollowupPostsMock.mockReset();
  useAuthMock.mockReset();
});

describe('ModFollowupPage', () => {
  it('does not fetch on mount with an empty URL', () => {
    useAuthMock.mockReturnValue({ me: modMe });
    render(harness());
    expect(getFollowupPostsMock).not.toHaveBeenCalled();
  });

  it('fetches on mount when URL contains applied filter params', async () => {
    useAuthMock.mockReturnValue({ me: modMe });
    getFollowupPostsMock.mockResolvedValue({ items: [], next_cursor: null });
    render(harness('/mod/follow-up?no_prayers=true&min_age_value=3&min_age_unit=days'));
    await waitFor(() => expect(getFollowupPostsMock).toHaveBeenCalled());
    expect(getFollowupPostsMock.mock.calls[0]![0]).toMatchObject({
      filters: { noPrayers: true },
      minAge: { value: 3, unit: 'days' },
    });
  });

  it('clicking Search writes URL params and triggers a fetch', async () => {
    useAuthMock.mockReturnValue({ me: modMe });
    getFollowupPostsMock.mockResolvedValue({ items: [], next_cursor: null });
    render(harness());
    await userEvent.click(screen.getByRole('button', { name: 'No prayers for 3 days' }));
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await waitFor(() => expect(getFollowupPostsMock).toHaveBeenCalled());
    expect(getFollowupPostsMock.mock.calls[0]![0]).toMatchObject({
      filters: { noPrayers: true },
      minAge: { value: 3, unit: 'days' },
    });
  });

  it('shows empty-state copy only after a search returned 0 results', async () => {
    useAuthMock.mockReturnValue({ me: modMe });
    getFollowupPostsMock.mockResolvedValue({ items: [], next_cursor: null });
    render(harness());
    expect(screen.queryByText(/no prayer requests match/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await waitFor(() => expect(screen.getByText(/no prayer requests match/i)).toBeInTheDocument());
  });
});
