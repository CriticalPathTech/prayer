import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileCommentComposer } from './MobileCommentComposer';

const apiFetchMock = vi.fn();
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

describe('MobileCommentComposer', () => {
  afterEach(() => apiFetchMock.mockReset());

  it('inline: starts collapsed showing only "Reply" button', () => {
    render(
      <MemoryRouter>
        <MobileCommentComposer postId="p1" participantId="u1" layout="inline" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /^reply$/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('inline: tapping Reply expands the textarea', async () => {
    render(
      <MemoryRouter>
        <MobileCommentComposer postId="p1" participantId="u1" layout="inline" />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /^reply$/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('pinned: textarea is always visible with placeholder', () => {
    render(
      <MemoryRouter>
        <MobileCommentComposer
          postId="p1"
          participantId="u1"
          layout="pinned"
          authorDisplayName="Mary"
        />
      </MemoryRouter>,
    );
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAttribute('placeholder', expect.stringMatching(/reply to mary/i));
  });

  it('submit POSTs /posts/:postId/comments with correct participantId', async () => {
    apiFetchMock.mockResolvedValue({});
    const onSent = vi.fn();
    render(
      <MemoryRouter>
        <MobileCommentComposer
          postId="p1"
          participantId="u9"
          layout="pinned"
          authorDisplayName="Mary"
          onSent={onSent}
        />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByRole('textbox'), 'praying');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    const [url, opts] = apiFetchMock.mock.calls[0]!;
    expect(url).toBe('/posts/p1/comments');
    expect(JSON.parse((opts as { body: string }).body)).toEqual({
      body: 'praying',
      participant_id: 'u9',
    });
    await waitFor(() => expect(onSent).toHaveBeenCalled());
  });

  it('clears the input after a successful send (pinned)', async () => {
    apiFetchMock.mockResolvedValue({});
    render(
      <MemoryRouter>
        <MobileCommentComposer
          postId="p1"
          participantId="u9"
          layout="pinned"
          authorDisplayName="Mary"
        />
      </MemoryRouter>,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(textarea, 'hi');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => expect(textarea.value).toBe(''));
  });

  it('shows an error message when submit fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('boom'));
    render(
      <MemoryRouter>
        <MobileCommentComposer
          postId="p1"
          participantId="u9"
          layout="pinned"
          authorDisplayName="Mary"
        />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByRole('textbox'), 'hi');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument());
  });

  it('Send is disabled when body is empty (inline)', async () => {
    render(
      <MemoryRouter>
        <MobileCommentComposer postId="p1" participantId="u1" layout="inline" />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /^reply$/i }));
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });
});
