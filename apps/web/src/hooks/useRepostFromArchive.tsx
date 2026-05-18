import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { getMyDraft, saveMyDraft } from '../lib/api';

import type { FeedPost } from './useFeed';

export interface UseRepostFromArchiveResult {
  /** Trigger a repost. Reads the current draft; warns before overwriting a
   * non-empty draft, otherwise overwrites silently. Then navigates to /compose. */
  repost: (post: FeedPost) => Promise<void>;
  /** Render this once at the page level. */
  confirmDialog: JSX.Element;
}

export function useRepostFromArchive(): UseRepostFromArchiveResult {
  const navigate = useNavigate();
  const [pending, setPending] = useState<FeedPost | null>(null);
  const [busy, setBusy] = useState(false);

  const doRepost = useCallback(
    async (post: FeedPost): Promise<void> => {
      setBusy(true);
      try {
        await saveMyDraft({ body: post.body, is_anonymous: post.is_anonymous });
        navigate('/compose');
      } finally {
        setBusy(false);
      }
    },
    [navigate],
  );

  const repost = useCallback(
    async (post: FeedPost): Promise<void> => {
      const { draft } = await getMyDraft();
      if (draft && draft.body.trim().length > 0) {
        setPending(post);
        return;
      }
      await doRepost(post);
    },
    [doRepost],
  );

  const confirmDialog = (
    <ConfirmDialog
      open={pending !== null}
      title="Discard your draft?"
      body="Reposting will replace your current draft."
      confirmLabel="Continue"
      busy={busy}
      onConfirm={() => {
        const target = pending;
        setPending(null);
        if (target) void doRepost(target);
      }}
      onCancel={() => setPending(null)}
    />
  );

  return { repost, confirmDialog };
}
