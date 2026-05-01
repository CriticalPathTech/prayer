import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../lib/api';

import type { ReactionMap } from './useReactions';

export interface Comment {
  id: string;
  post_id: string;
  author_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_anonymous_author: boolean;
  participant_id: string;
  body: string;
  reaction_count: number;
  is_hidden: boolean;
  flag_count: number;
  is_tombstone?: boolean;
  /** True when the comment author has been removed from this org. */
  is_former_member: boolean;
  created_at: string;
  updated_at: string;
  reactions: ReactionMap;
}

export interface Thread {
  participant_id: string;
  participant_display_name: string | null;
  comments: Comment[];
}

export interface UsePostCommentsResult {
  threads: Thread[];
  loading: boolean;
  error: string | null;
  addComment: (args: { body: string; participant_id?: string }) => Promise<void>;
  editComment: (commentId: string, body: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function usePostComments(postId: string | undefined): UsePostCommentsResult {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ threads: Thread[] }>(`/posts/${postId}/comments`);
      setThreads(res.threads);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addComment = useCallback(
    async (args: { body: string; participant_id?: string }): Promise<void> => {
      if (!postId) return;
      await apiFetch<{ comment: Comment }>(`/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify(args),
      });
      await load();
    },
    [postId, load],
  );

  const editComment = useCallback(
    async (commentId: string, body: string): Promise<void> => {
      if (!postId) return;
      await apiFetch<{ comment: Comment }>(`/posts/${postId}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      });
      await load();
    },
    [postId, load],
  );

  const deleteComment = useCallback(
    async (commentId: string): Promise<void> => {
      if (!postId) return;
      await apiFetch<void>(`/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
      await load();
    },
    [postId, load],
  );

  return { threads, loading, error, addComment, editComment, deleteComment, reload: load };
}
