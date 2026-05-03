import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import {
  clearSnapshotCache,
  getSnapshotId,
  ZERO_SNAPSHOT_ID,
} from '../../src/services/feed-snapshot.js';
import { insertPost, insertUser } from '../helpers/seed.js';

describe('getSnapshotId', () => {
  let db: Kysely<Database>;

  beforeAll(() => {
    db = initDb(process.env.TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    clearSnapshotCache();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('users').execute();
  });

  it('returns ZERO_SNAPSHOT_ID when no published posts exist', async () => {
    const result = await getSnapshotId(db);
    expect(result).toBe(ZERO_SNAPSHOT_ID);
  });

  it('returns the id of the most recently published post', async () => {
    const user = await insertUser(db);
    const first = await insertPost(db, { authorId: user.id, status: 'published' });
    const second = await insertPost(db, { authorId: user.id, status: 'published' });
    const result = await getSnapshotId(db);
    // UUIDv7 — second is chronologically larger
    expect(result).toBe(second.id);
    expect(result).not.toBe(first.id);
  });

  it('ignores draft and archived posts', async () => {
    const user = await insertUser(db);
    await insertPost(db, { authorId: user.id, status: 'draft' });
    await insertPost(db, { authorId: user.id, status: 'archived' });
    const result = await getSnapshotId(db);
    expect(result).toBe(ZERO_SNAPSHOT_ID);
  });

  it('returns cached value within TTL without re-querying', async () => {
    const user = await insertUser(db);
    const first = await insertPost(db, { authorId: user.id, status: 'published' });
    await getSnapshotId(db); // prime cache with first.id
    // Insert a newer post — should NOT be returned while cache is warm
    await insertPost(db, { authorId: user.id, status: 'published' });
    const result = await getSnapshotId(db);
    expect(result).toBe(first.id);
  });

  it('re-queries after cache is cleared', async () => {
    const user = await insertUser(db);
    const first = await insertPost(db, { authorId: user.id, status: 'published' });
    await getSnapshotId(db); // prime cache
    await insertPost(db, { authorId: user.id, status: 'published' });
    clearSnapshotCache();
    const result = await getSnapshotId(db);
    expect(result).not.toBe(first.id); // newer post is now returned
  });
});
