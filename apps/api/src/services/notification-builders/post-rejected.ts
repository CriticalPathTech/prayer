import { newId } from '@prayer/db';

import type { EventHandler } from '../event-worker.js';

interface RejectionPayload {
  moderation_note: string | null;
  moderated_by: string;
  body_preview: string;
}

export const postRejectedBuilder: EventHandler = async (event, trx) => {
  const payload = event.payload as RejectionPayload;
  if (!event.post_id) return;
  const post = await trx
    .selectFrom('posts')
    .select(['author_id'])
    .where('id', '=', event.post_id)
    .where('org_id', '=', event.org_id)
    .executeTakeFirst();
  if (!post) return;
  await trx
    .insertInto('notifications')
    .values({
      id: newId(),
      org_id: event.org_id,
      user_id: post.author_id,
      type: 'post.rejected',
      payload: {
        post_id: event.post_id,
        moderation_note: payload.moderation_note,
        moderated_by: payload.moderated_by,
        body_preview: payload.body_preview,
      } as never,
    })
    .execute();
};
