import { newId } from '@prayer/db';

import type { EventHandler } from '../event-worker.js';

interface FlagCreatedPayload {
  flag_id: string;
  target_type: 'post' | 'comment';
  target_id: string;
  reason: string;
  note?: string;
}

async function fetchTargetPreview(
  trx: Parameters<EventHandler>[1],
  targetType: 'post' | 'comment',
  targetId: string,
): Promise<string> {
  if (targetType === 'post') {
    const r = await trx
      .selectFrom('posts')
      .select('body')
      .where('id', '=', targetId)
      .executeTakeFirst();
    return (r?.body ?? '').slice(0, 80);
  }
  const r = await trx
    .selectFrom('comments')
    .select('body')
    .where('id', '=', targetId)
    .executeTakeFirst();
  return (r?.body ?? '').slice(0, 80);
}

// In-trx fanout is safe at community scale (≤ a handful of moderators).
// When scaling to hundreds of moderators, move this to a queue worker.
export const flagCreatedBuilder: EventHandler = async (event, trx) => {
  const payload = event.payload as FlagCreatedPayload;
  const flaggerId = event.actor_id;

  const moderators = await trx
    .selectFrom('user_orgs as uo')
    .innerJoin('users as u', 'u.id', 'uo.user_id')
    .where('uo.org_id', '=', event.org_id)
    .where('uo.role', 'in', ['moderator', 'super_user'] as const)
    .$if(flaggerId !== null, (qb) => qb.where('u.id', '!=', flaggerId!))
    .select('u.id')
    .execute();
  if (moderators.length === 0) return;

  const preview = await fetchTargetPreview(trx, payload.target_type, payload.target_id);
  for (const mod of moderators) {
    await trx
      .insertInto('notifications')
      .values({
        id: newId(),
        org_id: event.org_id,
        user_id: mod.id,
        type: 'flag.created',
        payload: {
          flag_id: payload.flag_id,
          target_type: payload.target_type,
          target_id: payload.target_id,
          reason: payload.reason,
          target_preview: preview,
          post_id: event.post_id,
          // flagger_id intentionally omitted — adjudicate content, not people.
        } as never,
      })
      .execute();
  }
};
