import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export interface HideInfo {
  actorId: string | null;
  displayName: string | null;
  source: 'auto' | 'manual' | null;
}

/** Batch-loads the latest `moderator.hide` event per post in `postIds`.
 * Auto-hides have `actor_id: null`; manual hides carry the moderator's id
 * and joined display name. Returns an empty map for an empty input. */
export async function fetchHideInfo(
  db: Kysely<Database>,
  postIds: string[],
  orgId: string,
): Promise<Map<string, HideInfo>> {
  const result = new Map<string, HideInfo>();
  if (postIds.length === 0) return result;
  const rows = await db
    .selectFrom('events as e')
    .leftJoin('users as u', 'u.id', 'e.actor_id')
    .select([
      'e.post_id',
      'e.actor_id',
      'u.display_name',
      sql<string | null>`e.payload->>'source'`.as('source'),
      'e.created_at',
    ])
    .where('e.org_id', '=', orgId)
    .where('e.type', '=', 'moderator.hide')
    .where('e.post_id', 'in', postIds)
    .orderBy('e.post_id')
    .orderBy('e.created_at', 'desc')
    .execute();
  for (const row of rows) {
    if (!row.post_id) continue;
    if (result.has(row.post_id)) continue; // keep the first (latest) per post
    result.set(row.post_id, {
      actorId: row.actor_id,
      displayName: row.display_name ?? null,
      source: row.source === 'auto' || row.source === 'manual' ? row.source : null,
    });
  }
  return result;
}
