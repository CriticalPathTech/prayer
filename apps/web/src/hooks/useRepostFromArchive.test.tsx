import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeFeedPost } from '../views/mobile/__fixtures__/feedPost';

import { useRepostFromArchive } from './useRepostFromArchive';

const getMyDraftMock = vi.fn();
const saveMyDraftMock = vi.fn();
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    getMyDraft: (...a: unknown[]) => getMyDraftMock(...a),
    saveMyDraft: (...a: unknown[]) => saveMyDraftMock(...a),
  };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function wrapper({ children }: { children: React.ReactNode }): JSX.Element {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useRepostFromArchive', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    getMyDraftMock.mockReset();
    saveMyDraftMock.mockReset();
    saveMyDraftMock.mockResolvedValue({ draft: makeFeedPost() });
  });
  afterEach(() => {
    navigateMock.mockReset();
    getMyDraftMock.mockReset();
    saveMyDraftMock.mockReset();
  });

  it('with no draft: writes the archived content to /me/draft and navigates to /compose without prompting', async () => {
    getMyDraftMock.mockResolvedValueOnce({ draft: null });
    const archived = makeFeedPost({ body: 'old prayer body', is_anonymous: true });
    const { result } = renderHook(() => useRepostFromArchive(), { wrapper });

    await act(async () => {
      await result.current.repost(archived);
    });

    expect(saveMyDraftMock).toHaveBeenCalledWith({
      body: 'old prayer body',
      is_anonymous: true,
    });
    expect(saveMyDraftMock.mock.calls[0]?.[0]).not.toHaveProperty('expires_at');
    expect(navigateMock).toHaveBeenCalledWith('/compose');
  });

  it('with an empty-body draft: still writes and navigates without prompting', async () => {
    getMyDraftMock.mockResolvedValueOnce({ draft: makeFeedPost({ body: '   ' }) });
    const archived = makeFeedPost({ body: 'old', is_anonymous: false });
    const { result } = renderHook(() => useRepostFromArchive(), { wrapper });

    await act(async () => {
      await result.current.repost(archived);
    });

    expect(saveMyDraftMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/compose');
  });

  it('with a non-empty draft: opens the confirm dialog and does NOT write or navigate', async () => {
    getMyDraftMock.mockResolvedValueOnce({ draft: makeFeedPost({ body: 'work in progress' }) });
    const archived = makeFeedPost({ body: 'old' });

    function Harness(): JSX.Element {
      const { repost, confirmDialog } = useRepostFromArchive();
      return (
        <>
          <button onClick={() => void repost(archived)}>Repost</button>
          {confirmDialog}
        </>
      );
    }

    render(<Harness />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: 'Repost' }));

    expect(
      await screen.findByRole('alertdialog', { name: /discard your draft/i }),
    ).toBeInTheDocument();
    expect(saveMyDraftMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('Cancel on the confirm dialog: no PUT, no navigation, dialog closes', async () => {
    getMyDraftMock.mockResolvedValueOnce({ draft: makeFeedPost({ body: 'in progress' }) });
    const archived = makeFeedPost({ body: 'old' });

    function Harness(): JSX.Element {
      const { repost, confirmDialog } = useRepostFromArchive();
      return (
        <>
          <button onClick={() => void repost(archived)}>Repost</button>
          {confirmDialog}
        </>
      );
    }

    render(<Harness />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: 'Repost' }));
    await screen.findByRole('alertdialog');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(saveMyDraftMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('Confirm on the dialog: PUT runs, navigation runs, dialog closes', async () => {
    getMyDraftMock.mockResolvedValueOnce({ draft: makeFeedPost({ body: 'in progress' }) });
    const archived = makeFeedPost({ body: 'old prayer', is_anonymous: true });

    function Harness(): JSX.Element {
      const { repost, confirmDialog } = useRepostFromArchive();
      return (
        <>
          <button onClick={() => void repost(archived)}>Repost</button>
          {confirmDialog}
        </>
      );
    }

    render(<Harness />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: 'Repost' }));
    await screen.findByRole('alertdialog');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(saveMyDraftMock).toHaveBeenCalledWith({
      body: 'old prayer',
      is_anonymous: true,
    });
    expect(navigateMock).toHaveBeenCalledWith('/compose');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
