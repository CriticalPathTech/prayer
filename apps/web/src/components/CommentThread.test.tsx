import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Thread } from '../hooks/usePostComments';

import { CommentThread } from './CommentThread';

type AuthReturn = {
  session: { user: { id: string } } | null;
  me: {
    id: string;
    email: string;
    displayName: string;
    role: 'member' | 'moderator' | 'super_user';
  } | null;
  loading: boolean;
  signOut: () => void;
};

const useAuthMock: ReturnType<typeof vi.fn<() => AuthReturn>> = vi.fn(() => ({
  session: null,
  me: null,
  loading: false,
  signOut: vi.fn(),
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

const thread: Thread = {
  participant_id: 'u1',
  participant_display_name: 'Alice',
  comments: [
    {
      id: 'c1',
      post_id: 'p',
      author_id: 'u1',
      display_name: 'Alice',
      avatar_url: null,
      is_anonymous_author: false,
      participant_id: 'u1',
      body: 'first',
      reaction_count: 0,
      is_hidden: false,
      flag_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      reactions: {},
    },
  ],
};

describe('CommentThread', () => {
  it('renders the participant header and comments', () => {
    render(
      <MemoryRouter>
        <CommentThread
          thread={thread}
          postId="p"
          callerId={null}
          callerIsPrivileged={false}
          canReply={false}
          onReply={vi.fn()}
          onDelete={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/thread with alice/i)).toBeInTheDocument();
    expect(screen.getByText('first')).toBeInTheDocument();
  });
});
