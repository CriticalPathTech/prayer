import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import {
  clearSnapshotCache,
  getSnapshotId,
  ZERO_SNAPSHOT_ID,
} from '../../src/services/feed-snapshot.js';
import { insertOrg, insertPost, insertUser } from '../helpers/seed.js';

describe('getSnapshotId', () => {
  let db: Kysely<Database>;
  let orgId: string;

  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'hopechurch-svc-feed-snapshot' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    clearSnapshotCache();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('returns ZERO_SNAPSHOT_ID when no published posts exist', async () => {
    const result = await getSnapshotId(db, orgId);
    expect(result).toBe(ZERO_SNAPSHOT_ID);
  });

  it('returns the id of the most recently published post', async () => {
    const user = await insertUser(db, { orgId });
    const first = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    const second = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    const result = await getSnapshotId(db, orgId);
    // UUIDv7 — second is chronologically larger
    expect(result).toBe(second.id);
    expect(result).not.toBe(first.id);
  });

  it('ignores draft and archived posts', async () => {
    const user = await insertUser(db, { orgId });
    await insertPost(db, { authorId: user.id, orgId, status: 'draft' });
    await insertPost(db, { authorId: user.id, orgId, status: 'archived' });
    const result = await getSnapshotId(db, orgId);
    expect(result).toBe(ZERO_SNAPSHOT_ID);
  });

  it('returns cached value within TTL without re-querying', async () => {
    const user = await insertUser(db, { orgId });
    const first = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    await getSnapshotId(db, orgId); // prime cache with first.id
    // Insert a newer post — should NOT be returned while cache is warm
    await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    const result = await getSnapshotId(db, orgId);
    expect(result).toBe(first.id);
  });

  it('re-queries after cache is cleared', async () => {
    const user = await insertUser(db, { orgId });
    const first = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    await getSnapshotId(db, orgId); // prime cache
    await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    clearSnapshotCache();
    const result = await getSnapshotId(db, orgId);
    expect(result).not.toBe(first.id); // newer post is now returned
  });
});
