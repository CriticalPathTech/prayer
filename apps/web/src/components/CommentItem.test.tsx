import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Comment } from '../hooks/usePostComments';

import { CommentItem } from './CommentItem';

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

const base: Comment = {
  id: 'c1',
  post_id: 'p',
  author_id: 'u1',
  display_name: 'Alice',
  avatar_url: null,
  is_anonymous_author: false,
  participant_id: 'u1',
  body: 'hi',
  reaction_count: 0,
  is_hidden: false,
  flag_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  reactions: {},
};

function renderItem(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('CommentItem', () => {
  it('renders display name + body', () => {
    renderItem(
      <CommentItem comment={base} postId="p" callerId={null} callerIsPrivileged={false} />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
  });

  it('renders "Anonymous (author)" when is_anonymous_author', () => {
    renderItem(
      <CommentItem
        comment={{ ...base, author_id: null, display_name: null, is_anonymous_author: true }}
        postId="p"
        callerId={null}
        callerIsPrivileged={false}
      />,
    );
    expect(screen.getByText(/anonymous \(author\)/i)).toBeInTheDocument();
  });

  it('shows Delete for the comment author', async () => {
    const onDelete = vi.fn();
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-u1' } },
      me: { id: 'u1', email: 'u1@test.local', displayName: 'Alice', role: 'member' as const },
      loading: false,
      signOut: vi.fn(),
    });
    renderItem(
      <CommentItem
        comment={base}
        postId="p"
        callerId="u1"
        callerIsPrivileged={false}
        onDelete={onDelete}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('c1');
  });

  it("shows Hide for a moderator on someone else's comment", () => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-mod' } },
      me: { id: 'mod', email: 'mod@test.local', displayName: 'Mod', role: 'moderator' as const },
      loading: false,
      signOut: vi.fn(),
    });
    renderItem(
      <CommentItem
        comment={base}
        postId="p"
        callerId="mod"
        callerIsPrivileged={true}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /hide/i })).toBeInTheDocument();
  });

  it('renders tombstone when comment.is_tombstone is true', () => {
    renderItem(
      <CommentItem
        comment={{ ...base, is_tombstone: true }}
        postId="p"
        callerId={null}
        callerIsPrivileged={false}
      />,
    );
    expect(screen.getByText(/hidden by a moderator/i)).toBeInTheDocument();
    expect(screen.queryByText('hi')).not.toBeInTheDocument();
  });

  it('shows hidden banner for the author viewing their own hidden comment', () => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-u1' } },
      me: { id: 'u1', email: 'u1@test.local', displayName: 'Alice', role: 'member' as const },
      loading: false,
      signOut: vi.fn(),
    });
    renderItem(
      <CommentItem
        comment={{ ...base, is_hidden: true }}
        postId="p"
        callerId="u1"
        callerIsPrivileged={false}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/hidden by a moderator\. contact/i)).toBeInTheDocument();
  });

  it('shows flag count pill for a moderator when flag_count > 0', () => {
    useAuthMock.mockReturnValue({
      session: { user: { id: 'supabase-mod' } },
      me: { id: 'mod', email: 'mod@test.local', displayName: 'Mod', role: 'moderator' as const },
      loading: false,
      signOut: vi.fn(),
    });
    renderItem(
      <CommentItem
        comment={{ ...base, flag_count: 3 }}
        postId="p"
        callerId="mod"
        callerIsPrivileged={true}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('link', { name: /flagged \(3\)/i })).toBeInTheDocument();
  });
});
