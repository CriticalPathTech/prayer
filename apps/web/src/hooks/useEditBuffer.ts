import { useCallback, useState } from 'react';

export interface EditBuffer {
  body?: string;
  expires_at?: string | null;
  /** epoch ms when the buffer was last written */
  savedAt: number;
}

export interface UseEditBufferResult {
  buffer: EditBuffer | null;
  /** Merge `next` into the stored buffer and persist. */
  set: (next: { body?: string; expires_at?: string | null }) => void;
  /** Remove the localStorage entry and reset state. */
  clear: () => void;
  lastSavedAt: number | null;
}

function storageKey(postId: string): string {
  return `post_edit_buffer:${postId}`;
}

function readBuffer(postId: string): EditBuffer | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(storageKey(postId));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as EditBuffer;
    if (typeof parsed.savedAt !== 'number') throw new Error('missing savedAt');
    return parsed;
  } catch {
    window.localStorage.removeItem(storageKey(postId));
    return null;
  }
}

export function useEditBuffer(postId: string): UseEditBufferResult {
  const [buffer, setBuffer] = useState<EditBuffer | null>(() => readBuffer(postId));

  const set = useCallback(
    (next: { body?: string; expires_at?: string | null }) => {
      const merged: EditBuffer = {
        ...(buffer ?? {}),
        ...next,
        savedAt: Date.now(),
      };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey(postId), JSON.stringify(merged));
      }
      setBuffer(merged);
    },
    [buffer, postId],
  );

  const clear = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey(postId));
    }
    setBuffer(null);
  }, [postId]);

  return { buffer, set, clear, lastSavedAt: buffer?.savedAt ?? null };
}
