import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileComposePage } from './MobileComposePage';

const useDraftMock = vi.fn();
vi.mock('../../hooks/useDraft', () => ({ useDraft: () => useDraftMock() }));

const publishMyDraftMock = vi.fn();
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, publishMyDraft: () => publishMyDraftMock() };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function makeDraft(overrides?: Partial<ReturnType<typeof useDraftMock>>) {
  return {
    draft: null,
    loading: false,
    save: vi.fn(),
    flush: vi.fn().mockResolvedValue(null),
    saving: false,
    lastSavedAt: null,
    error: null,
    ...overrides,
  };
}

describe('MobileComposePage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    publishMyDraftMock.mockResolvedValue({ post: { id: 'p1' } });
    useDraftMock.mockReturnValue(makeDraft());
  });
  afterEach(() => vi.clearAllMocks());

  it('renders close header titled "New request" with Publish button', () => {
    render(
      <MemoryRouter>
        <MobileComposePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('New request')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish/i })).toBeDisabled();
  });

  it('Publish becomes enabled when body has content', async () => {
    render(
      <MemoryRouter>
        <MobileComposePage />
      </MemoryRouter>,
    );
    const textarea = screen.getByRole('textbox', { name: /body/i });
    await userEvent.type(textarea, 'help me pray');
    expect(screen.getByRole('button', { name: /publish/i })).toBeEnabled();
  });

  it('Publish navigates to / on success', async () => {
    render(
      <MemoryRouter>
        <MobileComposePage />
      </MemoryRouter>,
    );
    const textarea = screen.getByRole('textbox', { name: /body/i });
    await userEvent.type(textarea, 'pray');
    await userEvent.click(screen.getByRole('button', { name: /publish/i }));
    await waitFor(() => expect(publishMyDraftMock).toHaveBeenCalled());
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
  });

  it('shows error from useDraft', () => {
    useDraftMock.mockReturnValue(makeDraft({ error: 'Could not publish' }));
    render(
      <MemoryRouter>
        <MobileComposePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Could not publish')).toBeInTheDocument();
  });
});
