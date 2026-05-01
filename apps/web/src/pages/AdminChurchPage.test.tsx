import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminChurchPage } from './AdminChurchPage';

const refresh = vi.fn();
const updateDisplayName = vi.fn();
const removeMember = vi.fn();

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    me: { id: 's1', email: 'su@x.com', displayName: 'Sue', avatarUrl: null, role: 'super_user' },
  }),
}));

vi.mock('../hooks/useChurchMembers', () => ({
  useChurchMembers: () => ({
    members: [
      {
        id: 's1',
        displayName: 'Sue',
        email: 'su@x.com',
        avatarUrl: null,
        role: 'super_user',
        joinedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'm1',
        displayName: 'Mary',
        email: 'm@x.com',
        avatarUrl: null,
        role: 'member',
        joinedAt: '2026-01-02T00:00:00Z',
      },
    ],
    loading: false,
    error: null,
    refresh,
  }),
}));
vi.mock('../hooks/useChurchSettings', () => ({
  useChurchSettings: () => ({ updateDisplayName, saving: false, error: null }),
}));
vi.mock('../hooks/useRemoveMember', () => ({
  useRemoveMember: () => ({ removeMember, removing: false, error: null }),
}));

beforeEach(() => {
  refresh.mockReset();
  updateDisplayName.mockReset();
  removeMember.mockReset().mockResolvedValue(undefined);
});

describe('AdminChurchPage', () => {
  it('renders the members table with both rows', () => {
    render(
      <MemoryRouter>
        <AdminChurchPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Sue')).toBeInTheDocument();
    expect(screen.getByText('Mary')).toBeInTheDocument();
    expect(screen.getByText('su@x.com')).toBeInTheDocument();
    expect(screen.getByText('m@x.com')).toBeInTheDocument();
  });

  it('does not show a Remove button for the current super_user (Sue)', () => {
    render(
      <MemoryRouter>
        <AdminChurchPage />
      </MemoryRouter>,
    );
    // Only one Remove button (for Mary), not two.
    const removeBtns = screen.getAllByRole('button', { name: /remove/i });
    expect(removeBtns).toHaveLength(1);
  });

  it('clicking Remove opens the dialog and calls removeMember on confirm', async () => {
    render(
      <MemoryRouter>
        <AdminChurchPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /remove/i }));
    // Scope to the dialog: it has role="alertdialog"
    const dialog = screen.getByRole('alertdialog');
    const input = dialog.querySelector('input[type="text"]') as HTMLInputElement;
    await userEvent.type(input, 'm@x.com');
    const dialogRemoveBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Remove',
    ) as HTMLButtonElement;
    await userEvent.click(dialogRemoveBtn);
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith('m1'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('Save calls updateDisplayName when input is non-empty', async () => {
    updateDisplayName.mockResolvedValueOnce({
      id: 'o1',
      slug: 'hope',
      displayName: 'New Name',
    });
    render(
      <MemoryRouter>
        <AdminChurchPage />
      </MemoryRouter>,
    );
    // Field labels aren't htmlFor-bound — use placeholder for stable selection.
    const input = screen.getByPlaceholderText(/unchanged/i);
    await userEvent.type(input, 'New Name');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateDisplayName).toHaveBeenCalledWith('New Name'));
  });
});
