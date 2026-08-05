import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileModQueuePage } from './MobileModQueuePage';

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const useModQueueMock = vi.fn();
vi.mock('../../hooks/useModQueue', () => ({ useModQueue: (s: unknown) => useModQueueMock(s) }));

const SAMPLE_ITEM = {
  target_type: 'post' as const,
  target_id: 'p1',
  post_id: 'p1',
  preview: 'Sample post body',
  flag_count: 4,
  reasons: ['spam', 'harassment'],
  hidden: false,
  images: [],
};

describe('MobileModQueuePage', () => {
  beforeEach(() => {
    useModQueueMock.mockReturnValue({
      items: [SAMPLE_ITEM],
      loading: false,
      error: null,
      hideTarget: vi.fn(),
      unhideTarget: vi.fn(),
      dismissFlags: vi.fn(),
    });
  });
  afterEach(() => vi.clearAllMocks());

  it('redirects when role is not privileged', () => {
    useAuthMock.mockReturnValue({
      me: { id: 'me', email: 'm@t.local', displayName: 'Mary', avatarUrl: null, role: 'member' },
    });
    render(
      <MemoryRouter initialEntries={['/mod/queue']}>
        <MobileModQueuePage />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Reports')).not.toBeInTheDocument();
  });

  it('renders Reports header, Flagged/Hidden tabs, and one item card', () => {
    useAuthMock.mockReturnValue({
      me: { id: 'me', email: 'm@t.local', displayName: 'Mod', avatarUrl: null, role: 'moderator' },
    });
    render(
      <MemoryRouter initialEntries={['/mod/queue']}>
        <MobileModQueuePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^flagged$/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /^hidden$/i })).toHaveAttribute('href', '/mod/hidden');
    expect(screen.getByText(/sample post body/i)).toBeInTheDocument();
    expect(screen.getByText(/4 flags/i)).toBeInTheDocument();
  });

  it('calls useModQueue with status=pending (Flagged tab)', () => {
    useAuthMock.mockReturnValue({
      me: { id: 'me', email: 'm@t.local', displayName: 'Mod', avatarUrl: null, role: 'moderator' },
    });
    render(
      <MemoryRouter>
        <MobileModQueuePage />
      </MemoryRouter>,
    );
    expect(useModQueueMock).toHaveBeenLastCalledWith('pending');
  });

  it('Hide button calls hideTarget when item is not hidden', async () => {
    const hideTarget = vi.fn();
    useModQueueMock.mockReturnValue({
      items: [SAMPLE_ITEM],
      loading: false,
      error: null,
      hideTarget,
      unhideTarget: vi.fn(),
      dismissFlags: vi.fn(),
    });
    useAuthMock.mockReturnValue({
      me: { id: 'me', email: 'm@t.local', displayName: 'Mod', avatarUrl: null, role: 'moderator' },
    });
    render(
      <MemoryRouter>
        <MobileModQueuePage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /^hide$/i }));
    expect(hideTarget).toHaveBeenCalledWith('post', 'p1');
  });

  it('renders every photo attached to a flagged post', () => {
    useModQueueMock.mockReturnValue({
      items: [
        {
          ...SAMPLE_ITEM,
          images: [
            { id: 'i1', url: 'full-1', thumb_url: 'thumb-1', width: 10, height: 10, purged: false },
            { id: 'i2', url: 'full-2', thumb_url: 'thumb-2', width: 10, height: 10, purged: false },
          ],
        },
      ],
      loading: false,
      error: null,
      hideTarget: vi.fn(),
      unhideTarget: vi.fn(),
      dismissFlags: vi.fn(),
    });
    useAuthMock.mockReturnValue({
      me: { id: 'me', email: 'm@t.local', displayName: 'Mod', avatarUrl: null, role: 'moderator' },
    });
    render(
      <MemoryRouter>
        <MobileModQueuePage />
      </MemoryRouter>,
    );
    const images = screen
      .getAllByRole('img')
      .filter((img) => img.getAttribute('src')?.startsWith('full-'));
    expect(images).toHaveLength(2);
  });

  it('renders no image elements for a flagged item with no photos', () => {
    useAuthMock.mockReturnValue({
      me: { id: 'me', email: 'm@t.local', displayName: 'Mod', avatarUrl: null, role: 'moderator' },
    });
    render(
      <MemoryRouter>
        <MobileModQueuePage />
      </MemoryRouter>,
    );
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });
});
