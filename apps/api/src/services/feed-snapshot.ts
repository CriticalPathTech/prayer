import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export const ZERO_SNAPSHOT_ID = '00000000-0000-0000-0000-000000000000';

const CACHE_TTL_MS = 5_000;

let cached: { snapshotId: string; expiresAt: number } | null = null;

export function clearSnapshotCache(): void {
  cached = null;
}

export async function getSnapshotId(db: Kysely<Database>): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.snapshotId;
  const row = await db
    .selectFrom('posts')
    .select(sql<string | null>`max(posts.id::text)`.as('max_id'))
    .where('status', '=', 'published')
    .executeTakeFirst();
  const snapshotId = row?.max_id ?? ZERO_SNAPSHOT_ID;
  cached = { snapshotId, expiresAt: Date.now() + CACHE_TTL_MS };
  return snapshotId;
}
