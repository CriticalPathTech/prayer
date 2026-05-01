import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';

/** Batch lookup: which of the given userIds are members of orgId?
 *
 * Mirrors the prayedSet / reactions-map batch pattern (see services/feed.ts).
 * Used by feed, post-detail, comments, archive, and mod-queue endpoints to
 * mark posts/comments authored by users no longer in the org. */
export async function fetchMemberSet(
  db: Kysely<Database>,
  orgId: string,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db
    .selectFrom('user_orgs')
    .select('user_id')
    .where('org_id', '=', orgId)
    .where('user_id', 'in', userIds)
    .execute();
  return new Set(rows.map((r) => r.user_id));
}
