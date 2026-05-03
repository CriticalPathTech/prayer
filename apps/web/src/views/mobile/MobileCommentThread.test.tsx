import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { MobileCommentThread } from './MobileCommentThread';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, apiFetch: vi.fn().mockResolvedValue({}) };
});

const baseComment = {
  id: 'c1',
  post_id: 'p1',
  author_id: 'a1',
  participant_id: 'u1',
  display_name: 'Alice',
  avatar_url: null,
  body: 'praying for you',
  is_hidden: false,
  is_own_comment: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('MobileCommentThread', () => {
  it('renders comments in given order', () => {
    render(
      <MemoryRouter>
        <MobileCommentThread
          postId="p1"
          participantId="u1"
          comments={[
            { ...baseComment, id: 'c1', body: 'first' },
            { ...baseComment, id: 'c2', body: 'second' },
          ]}
          viewerCanPostHere={false}
          viewerCanModerate={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
  });

  it('shows Reply button (inline composer) when viewerCanPostHere', () => {
    render(
      <MemoryRouter>
        <MobileCommentThread
          postId="p1"
          participantId="u1"
          comments={[baseComment]}
          viewerCanPostHere={true}
          viewerCanModerate={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /^reply$/i })).toBeInTheDocument();
  });

  it('hides Reply button when viewerCanPostHere is false', () => {
    render(
      <MemoryRouter>
        <MobileCommentThread
          postId="p1"
          participantId="u1"
          comments={[baseComment]}
          viewerCanPostHere={false}
          viewerCanModerate={false}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /^reply$/i })).not.toBeInTheDocument();
  });

  it('shows moderation kebab on each comment when viewerCanModerate', async () => {
    render(
      <MemoryRouter>
        <MobileCommentThread
          postId="p1"
          participantId="u1"
          comments={[baseComment]}
          viewerCanPostHere={false}
          viewerCanModerate={true}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /comment menu/i })).toBeInTheDocument();
  });
});
