import { useCallback, useRef, useState } from 'react';

import { apiFetch } from '../lib/api';

export interface ReactionSummary {
  count: number;
  mine: boolean;
}
export type ReactionMap = Record<string, ReactionSummary>;

export interface UseReactionsInput {
  targetType: 'post' | 'comment';
  postId: string;
  targetId: string;
  initial: ReactionMap;
}

export interface UseReactionsResult {
  reactions: ReactionMap;
  toggle: (emoji: string) => Promise<void>;
}

interface ToggleResponse {
  reacted: boolean;
  reaction_count: number;
}

export function useReactions(input: UseReactionsInput): UseReactionsResult {
  const [reactions, setReactions] = useState<ReactionMap>(input.initial);
  const inFlight = useRef<Set<string>>(new Set());

  const toggle = useCallback(
    async (emoji: string): Promise<void> => {
      if (inFlight.current.has(emoji)) return;
      inFlight.current.add(emoji);
      const prev = reactions[emoji] ?? { count: 0, mine: false };
      const next = { count: prev.count + (prev.mine ? -1 : 1), mine: !prev.mine };
      setReactions((s) => ({ ...s, [emoji]: next }));
      const path =
        input.targetType === 'post'
          ? `/posts/${input.postId}/reactions`
          : `/posts/${input.postId}/comments/${input.targetId}/reactions`;
      try {
        await apiFetch<ToggleResponse>(path, {
          method: 'POST',
          body: JSON.stringify({ emoji }),
        });
      } catch (err) {
        setReactions((s) => ({ ...s, [emoji]: prev }));
        throw err;
      } finally {
        inFlight.current.delete(emoji);
      }
    },
    [reactions, input.targetType, input.postId, input.targetId],
  );

  return { reactions, toggle };
}
