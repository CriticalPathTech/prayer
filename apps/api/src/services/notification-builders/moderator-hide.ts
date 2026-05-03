import { newId } from '@prayer/db';

import type { EventHandler } from '../event-worker.js';

interface ModerationPayload {
  target_type: 'post' | 'comment';
  target_id: string;
  source: 'auto' | 'manual';
}

export const moderatorHideBuilder: EventHandler = async (event, trx) => {
  const payload = event.payload as ModerationPayload;
  let authorId: string | null = null;
  let postId: string | null = null;

  if (payload.target_type === 'post') {
    const row = await trx
      .selectFrom('posts')
      .select(['author_id', 'id'])
      .where('id', '=', payload.target_id)
      .executeTakeFirst();
    if (!row) return;
    authorId = row.author_id;
    postId = row.id;
  } else {
    const row = await trx
      .selectFrom('comments')
      .select(['author_id', 'post_id'])
      .where('id', '=', payload.target_id)
      .executeTakeFirst();
    if (!row) return;
    authorId = row.author_id;
    postId = row.post_id;
  }

  await trx
    .insertInto('notifications')
    .values({
      id: newId(),
      user_id: authorId,
      type: 'moderator.hide',
      payload: {
        target_type: payload.target_type,
        target_id: payload.target_id,
        source: payload.source,
        post_id: postId,
      } as never,
    })
    .execute();
};
