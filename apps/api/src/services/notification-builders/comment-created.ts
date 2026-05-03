import { newId } from '@prayer/db';

import type { EventHandler } from '../event-worker.js';

interface CommentCreatedPayload {
  comment_id: string;
  post_id: string;
  post_author_id: string;
  commenter_id: string;
  commenter_display_name: string;
  preview: string;
}

export const commentCreatedBuilder: EventHandler = async (event, trx) => {
  const payload = event.payload as CommentCreatedPayload;
  if (payload.commenter_id === payload.post_author_id) return;
  await trx
    .insertInto('notifications')
    .values({
      id: newId(),
      user_id: payload.post_author_id,
      type: 'comment.created',
      payload: {
        comment_id: payload.comment_id,
        post_id: payload.post_id,
        commenter_id: payload.commenter_id,
        commenter_display_name: payload.commenter_display_name,
        preview: payload.preview,
      } as never,
    })
    .execute();
};
