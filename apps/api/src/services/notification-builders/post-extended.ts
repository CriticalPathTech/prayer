import { newId } from '@prayer/db';

import type { EventHandler } from '../event-worker.js';

interface ExtendedPayload {
  old_expires_at: string | null;
  new_expires_at: string;
  duration_days: number;
  was_archived: boolean;
  extended_by: string;
}

/**
 * Notify the prayer's author that a moderator extended (or un-archived + extended)
 * their request, so they know leadership is engaged. Skips the notification when
 * the moderator is also the author — no point pinging yourself.
 */
export const postExtendedBuilder: EventHandler = async (event, trx) => {
  const payload = event.payload as ExtendedPayload;
  if (!event.post_id) return;
  const post = await trx
    .selectFrom('posts')
    .select(['author_id'])
    .where('id', '=', event.post_id)
    .where('org_id', '=', event.org_id)
    .executeTakeFirst();
  if (!post) return;
  if (post.author_id === payload.extended_by) return;

  await trx
    .insertInto('notifications')
    .values({
      id: newId(),
      org_id: event.org_id,
      user_id: post.author_id,
      type: 'post.extended',
      payload: {
        post_id: event.post_id,
        duration_days: payload.duration_days,
        new_expires_at: payload.new_expires_at,
        was_archived: payload.was_archived,
      } as never,
    })
    .execute();
};
