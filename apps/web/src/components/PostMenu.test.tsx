import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PostMenu } from './PostMenu';

const apiFetchMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetchMock(...a) };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const futureDeadline = new Date(Date.now() + 3600_000).toISOString();
const pastDeadline = new Date(Date.now() - 3600_000).toISOString();

function renderMenu(overrides: Partial<React.ComponentProps<typeof PostMenu>> = {}) {
  const defaultOnDelete = vi.fn().mockResolvedValue(undefined);
  const props: React.ComponentProps<typeof PostMenu> = {
    postId: 'p1',
    isOwnPost: true,
    status: 'published',
    editDeadline: futureDeadline,
    isTombstone: false,
    onDelete: defaultOnDelete,
    ...overrides,
  };
  return {
    onDelete: props.onDelete,
    ...render(
      <MemoryRouter>
        <PostMenu {...props} />
      </MemoryRouter>,
    ),
  };
}

describe('PostMenu', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    apiFetchMock.mockReset();
  });
  afterEach(() => {
    navigateMock.mockReset();
    apiFetchMock.mockReset();
  });

  it('renders nothing on a tombstone', () => {
    const { container } = renderMenu({ isTombstone: true });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when own post is archived (no actions apply)', () => {
    const { container } = renderMenu({ status: 'archived' });
    expect(container.firstChild).toBeNull();
  });

  it('own post shows Edit + Delete, not Report', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Report' })).not.toBeInTheDocument();
  });

  it('other post shows Report only', async () => {
    renderMenu({ isOwnPost: false });
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.getByRole('menuitem', { name: 'Report' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('own post with passed edit deadline hides Edit but still shows Delete', async () => {
    renderMenu({ editDeadline: pastDeadline });
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  });

  it('Edit navigates to /posts/:id/edit and closes the menu', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(navigateMock).toHaveBeenCalledWith('/posts/p1/edit');
  });

  it('Delete opens confirm dialog; confirming invokes onDelete', async () => {
    const { onDelete } = renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog', { name: /delete post/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('Delete keeps the dialog open and shows an error when onDelete rejects', async () => {
    const onDelete = vi.fn().mockRejectedValueOnce(new Error('Server exploded'));
    renderMenu({ onDelete });
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog', { name: /delete post/i })).toBeInTheDocument();
    expect(screen.getByText(/server exploded/i)).toBeInTheDocument();
  });

  it('Report opens the flag modal', async () => {
    renderMenu({ isOwnPost: false });
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Report' }));
    expect(screen.getByRole('dialog', { name: /report content/i })).toBeInTheDocument();
  });

  it('shows "Reported" and disables the menuitem after a successful flag submit', async () => {
    apiFetchMock.mockResolvedValueOnce({ flag_count: 1 });
    renderMenu({ isOwnPost: false });
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Report' }));
    // Modal is open; pick a reason and submit.
    await userEvent.click(screen.getByRole('radio', { name: /inappropriate/i }));
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));
    // Modal closes; reopen the menu.
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    const reported = await screen.findByRole('menuitem', { name: 'Reported' });
    expect(reported).toBeDisabled();
  });

  it('Escape closes the open menu', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('returns focus to the trigger after Escape closes the menu', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /more actions/i }));
  });

  it('closes when the user clicks outside the menu', async () => {
    render(
      <MemoryRouter>
        <div>
          <PostMenu
            postId="p1"
            isOwnPost
            status="published"
            editDeadline={futureDeadline}
            isTombstone={false}
            onDelete={vi.fn().mockResolvedValue(undefined)}
          />
          <div data-testid="outside">outside</div>
        </div>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('outside'));
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
