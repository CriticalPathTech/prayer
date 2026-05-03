import { sql } from 'kysely';

import type { EventHandler } from './event-worker.js';
import { writeModerationEvent } from './events.js';

interface FlagPayload {
  flag_id: string;
  target_type: 'post' | 'comment';
  target_id: string;
  reason: string;
  note?: string;
}

export const flagConsumer: EventHandler = async (event, trx) => {
  const payload = event.payload as FlagPayload;
  const { target_type, target_id } = payload;
  const table = sql.id(target_type === 'post' ? 'posts' : 'comments');

  // Lock the target row — serializes concurrent flag.* handlers for this target.
  await sql`SELECT id FROM ${table} WHERE id = ${target_id} FOR UPDATE`.execute(trx);

  // Idempotent recompute of open flags.
  await sql`
    UPDATE ${table} SET flag_count = (
      SELECT COUNT(*) FROM flags
      WHERE target_type = ${target_type} AND target_id = ${target_id} AND resolved_at IS NULL
    )
    WHERE id = ${target_id}
  `.execute(trx);

  if (event.type !== 'flag.created') return;

  if (target_type === 'post') {
    const row = await trx
      .selectFrom('posts')
      .select(['status', 'flag_count'])
      .where('id', '=', target_id)
      .executeTakeFirst();
    if (!row || row.status === 'hidden' || row.flag_count < 2) return;

    const flipped = await trx
      .updateTable('posts')
      .set({ status: 'hidden' })
      .where('id', '=', target_id)
      .where('status', '!=', 'hidden')
      .returning('id')
      .executeTakeFirst();
    if (!flipped) return;

    await writeModerationEvent(trx, {
      kind: 'moderator.hide',
      postId: target_id,
      actorId: null,
      targetType: 'post',
      targetId: target_id,
      source: 'auto',
    });
    return;
  }

  const row = await trx
    .selectFrom('comments')
    .select(['is_hidden', 'flag_count', 'post_id'])
    .where('id', '=', target_id)
    .executeTakeFirst();
  if (!row || row.is_hidden || row.flag_count < 2) return;

  const flipped = await trx
    .updateTable('comments')
    .set({ is_hidden: true })
    .where('id', '=', target_id)
    .where('is_hidden', '=', false)
    .returning('id')
    .executeTakeFirst();
  if (!flipped) return;

  await writeModerationEvent(trx, {
    kind: 'moderator.hide',
    postId: row.post_id,
    actorId: null,
    targetType: 'comment',
    targetId: target_id,
    source: 'auto',
  });
};
