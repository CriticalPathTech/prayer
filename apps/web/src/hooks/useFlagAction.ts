import { useCallback, useState } from 'react';

import { apiFetch, ApiError } from '../lib/api';

export interface SubmitFlagInput {
  targetType: 'post' | 'comment';
  postId: string;
  targetId: string;
  reason: string;
  note?: string;
}

export interface UseFlagActionResult {
  submit: (input: SubmitFlagInput) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useFlagAction(): UseFlagActionResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useCallback(async (input: SubmitFlagInput): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const path =
        input.targetType === 'post'
          ? `/posts/${input.postId}/flags`
          : `/posts/${input.postId}/comments/${input.targetId}/flags`;
      await apiFetch<{ flag_count: number }>(path, {
        method: 'POST',
        body: JSON.stringify({
          reason: input.reason,
          ...(input.note !== undefined ? { note: input.note } : {}),
        }),
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_FLAGGED') {
        setError('You already flagged this');
      } else if (err instanceof ApiError && err.code === 'SELF_FLAG') {
        setError('You cannot flag your own content');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to flag');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);
  return { submit, loading, error };
}
