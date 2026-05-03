import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobilePageHeader } from './MobilePageHeader';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

describe('MobilePageHeader', () => {
  beforeEach(() => navigateMock.mockReset());
  afterEach(() => vi.clearAllMocks());

  it('renders the feed variant with hamburger, brand, bell, and pen', async () => {
    const onMenu = vi.fn();
    render(
      <MemoryRouter>
        <MobilePageHeader variant={{ kind: 'feed', onMenu, unreadCount: 0 }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument();
    expect(screen.getByText('Prayer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new request/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /menu/i }));
    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  it('shows the unread dot when unreadCount > 0', () => {
    render(
      <MemoryRouter>
        <MobilePageHeader variant={{ kind: 'feed', onMenu: () => {}, unreadCount: 3 }} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('mobile-bell-dot')).toBeInTheDocument();
  });

  it('hides the unread dot when unreadCount is 0', () => {
    render(
      <MemoryRouter>
        <MobilePageHeader variant={{ kind: 'feed', onMenu: () => {}, unreadCount: 0 }} />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('mobile-bell-dot')).not.toBeInTheDocument();
  });

  it('renders the back variant with title and default navigate(-1) on tap', async () => {
    render(
      <MemoryRouter>
        <MobilePageHeader variant={{ kind: 'back', title: 'Request' }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Request')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it('uses onBack override on the back variant', async () => {
    const onBack = vi.fn();
    render(
      <MemoryRouter>
        <MobilePageHeader variant={{ kind: 'back', title: 'Archive', onBack }} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('renders the close variant with title and default navigate(-1) on tap', async () => {
    render(
      <MemoryRouter>
        <MobilePageHeader variant={{ kind: 'close', title: 'New request' }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('New request')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it('renders the right slot on close variant', () => {
    render(
      <MemoryRouter>
        <MobilePageHeader
          variant={{
            kind: 'close',
            title: 'New request',
            right: <button type="button">Publish</button>,
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });
});
