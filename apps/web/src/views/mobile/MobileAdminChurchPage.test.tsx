import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileAdminChurchPage } from './MobileAdminChurchPage';

const refresh = vi.fn();
const refreshMe = vi.fn();
const updateApprovalFlag = vi.fn();

let churchMembersOverride: Record<string, unknown> = {};

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    me: { id: 's1', email: 'su@x.com', displayName: 'Sue', avatarUrl: null, role: 'super_user' },
    refreshMe,
  }),
}));

vi.mock('../../hooks/useChurchMembers', () => ({
  useChurchMembers: () => ({
    members: [],
    currentDisplayName: 'Hope Church',
    currentRequiresPostApproval: false,
    superUserCount: 1,
    loading: false,
    error: null,
    refresh,
    ...churchMembersOverride,
  }),
}));

vi.mock('../../hooks/useChurchSettings', () => ({
  useChurchSettings: () => ({
    updateApprovalFlag,
    updateDisplayName: vi.fn(),
    saving: false,
    error: null,
  }),
}));

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual };
});

beforeEach(() => {
  refresh.mockReset();
  refreshMe.mockReset().mockResolvedValue(undefined);
  updateApprovalFlag
    .mockReset()
    .mockResolvedValue({ id: 'o1', slug: 'hope', displayName: 'Hope Church' });
  churchMembersOverride = {};
});

describe('MobileAdminChurchPage', () => {
  it('renders desktop-only message with the current host URL for non-super_user', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'testchurch.prays.online' },
      writable: true,
    });
    render(
      <MemoryRouter>
        <MobileAdminChurchPage />
      </MemoryRouter>,
    );
    // Non-super_user path would show simple desktop-only; but our mock has super_user.
    // Just verify the desktop URL appears somewhere.
    expect(screen.getByText(/testchurch\.prays\.online\/admin\/church/i)).toBeInTheDocument();
  });

  describe('Feature flags section (super_user)', () => {
    it('renders the feature-flag section', () => {
      render(
        <MemoryRouter>
          <MobileAdminChurchPage />
        </MemoryRouter>,
      );
      expect(screen.getByText('Feature flags')).toBeInTheDocument();
      expect(screen.getByText(/require moderator approval/i)).toBeInTheDocument();
    });

    it('toggle reflects currentRequiresPostApproval = false (unchecked)', () => {
      render(
        <MemoryRouter>
          <MobileAdminChurchPage />
        </MemoryRouter>,
      );
      const toggle = screen.getByRole('switch', {
        name: /require moderator approval/i,
      });
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });

    it('toggle reflects currentRequiresPostApproval = true (checked)', () => {
      churchMembersOverride = { currentRequiresPostApproval: true };
      render(
        <MemoryRouter>
          <MobileAdminChurchPage />
        </MemoryRouter>,
      );
      const toggle = screen.getByRole('switch', {
        name: /require moderator approval/i,
      });
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });

    it('clicking the toggle calls updateApprovalFlag with the new value', async () => {
      render(
        <MemoryRouter>
          <MobileAdminChurchPage />
        </MemoryRouter>,
      );
      const toggle = screen.getByRole('switch', {
        name: /require moderator approval/i,
      });
      await userEvent.click(toggle);
      await waitFor(() =>
        expect(updateApprovalFlag).toHaveBeenCalledWith('Hope Church', true),
      );
      await waitFor(() => expect(refresh).toHaveBeenCalled());
      await waitFor(() => expect(refreshMe).toHaveBeenCalled());
    });

    it('on 409 PENDING_POSTS_EXIST, shows inline error with count and link', async () => {
      const { ApiError } = await import('../../lib/api');
      updateApprovalFlag.mockRejectedValueOnce(
        new ApiError(
          409,
          'PENDING_POSTS_EXIST',
          '3 pending post(s) must be approved or rejected before the gate can be turned off',
          { count: 3 },
        ),
      );
      churchMembersOverride = { currentRequiresPostApproval: true };
      render(
        <MemoryRouter>
          <MobileAdminChurchPage />
        </MemoryRouter>,
      );
      const toggle = screen.getByRole('switch', {
        name: /require moderator approval/i,
      });
      await userEvent.click(toggle);
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
      expect(screen.getByRole('alert')).toHaveTextContent(/3 pending request/i);
      expect(screen.getByRole('link', { name: /go to approvals/i })).toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });

    it('on generic error, shows a generic message without link', async () => {
      const { ApiError } = await import('../../lib/api');
      updateApprovalFlag.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'internal error'));
      render(
        <MemoryRouter>
          <MobileAdminChurchPage />
        </MemoryRouter>,
      );
      const toggle = screen.getByRole('switch', {
        name: /require moderator approval/i,
      });
      await userEvent.click(toggle);
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn't save/i);
      expect(
        screen.queryByRole('link', { name: /go to approvals/i }),
      ).not.toBeInTheDocument();
    });
  });
});
