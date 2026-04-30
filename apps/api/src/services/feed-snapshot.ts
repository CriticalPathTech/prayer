import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export const ZERO_SNAPSHOT_ID = '00000000-0000-0000-0000-000000000000';

const CACHE_TTL_MS = 5_000;

const cacheByOrg = new Map<string, { snapshotId: string; expiresAt: number }>();

export function clearSnapshotCache(): void {
  cacheByOrg.clear();
}

export async function getSnapshotId(db: Kysely<Database>, orgId: string): Promise<string> {
  const entry = cacheByOrg.get(orgId);
  if (entry && entry.expiresAt > Date.now()) return entry.snapshotId;
  const row = await db
    .selectFrom('posts')
    .select(sql<string | null>`max(posts.id::text)`.as('max_id'))
    .where('org_id', '=', orgId)
    .where('status', '=', 'published')
    .executeTakeFirst();
  const snapshotId = row?.max_id ?? ZERO_SNAPSHOT_ID;
  cacheByOrg.set(orgId, { snapshotId, expiresAt: Date.now() + CACHE_TTL_MS });
  return snapshotId;
}
