import type { Database } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';

import { NotFoundError } from '../middleware/error.js';

import { writePrayerEvent } from './events.js';

export interface TogglePrayerInput {
  callerId: string;
  orgId: string;
  postId: string;
}

export interface TogglePrayerResult {
  prayed: boolean;
  prayer_count: number;
}

export async function togglePrayer(
  db: Kysely<Database>,
  input: TogglePrayerInput,
): Promise<TogglePrayerResult> {
  return db.transaction().execute(async (trx) => {
    const post = await trx
      .selectFrom('posts')
      .select(['id', 'status', 'prayer_count'])
      .where('id', '=', input.postId)
      .where('org_id', '=', input.orgId)
      .executeTakeFirst();
    if (!post || post.status !== 'published') throw new NotFoundError('Post not found');

    const existing = await trx
      .selectFrom('prayers')
      .select('id')
      .where('post_id', '=', input.postId)
      .where('user_id', '=', input.callerId)
      .forUpdate()
      .executeTakeFirst();

    if (existing) {
      await trx.deleteFrom('prayers').where('id', '=', existing.id).execute();
      await writePrayerEvent(trx, {
        kind: 'prayer.removed',
        orgId: input.orgId,
        postId: input.postId,
        actorId: input.callerId,
      });
    } else {
      await trx
        .insertInto('prayers')
        .values({
          id: newId(),
          org_id: input.orgId,
          post_id: input.postId,
          user_id: input.callerId,
        })
        .execute();
      await writePrayerEvent(trx, {
        kind: 'prayer.added',
        orgId: input.orgId,
        postId: input.postId,
        actorId: input.callerId,
      });
    }
    const after = await trx
      .selectFrom('posts')
      .select('prayer_count')
      .where('id', '=', input.postId)
      .where('org_id', '=', input.orgId)
      .executeTakeFirstOrThrow();
    return { prayed: !existing, prayer_count: after.prayer_count };
  });
}
