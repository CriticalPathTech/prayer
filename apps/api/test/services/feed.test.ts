import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { encodeCursor } from '../../src/services/cursor.js';
import { fetchFeed } from '../../src/services/feed.js';
import { clearSnapshotCache } from '../../src/services/feed-snapshot.js';
import { getTestchurchOrgId, insertPost, insertUser } from '../helpers/seed.js';

describe('fetchFeed pinned section', () => {
  let db: Kysely<Database>;
  let orgId: string;

  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await getTestchurchOrgId(db);
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    clearSnapshotCache();
    await db.deleteFrom('prayers').execute();
    await db.deleteFrom('reactions').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('first page returns pinned[] ordered by pinned_at desc, excluded from posts[]', async () => {
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const author = await insertUser(db, { orgId, role: 'member' });
    const pinned1 = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      pinned: { byUserId: mod.id, durationDays: 7 },
    });
    // Force pinned2's pinned_at to be later than pinned1's by updating directly.
    const pinned2 = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      pinned: { byUserId: mod.id, durationDays: 7 },
    });
    await db
      .updateTable('posts')
      .set({ pinned_at: new Date(Date.now() + 1_000) })
      .where('id', '=', pinned2.id)
      .execute();
    const plain = await insertPost(db, { authorId: author.id, orgId, status: 'published' });

    const feed = await fetchFeed(db, {
      filter: 'all',
      limit: 50,
      callerRole: 'member',
      callerId: author.id,
      orgId,
    });

    expect(feed.pinned.map((p) => p.id)).toEqual([pinned2.id, pinned1.id]);
    expect(feed.posts.map((p) => p.id)).toEqual([plain.id]);
  });

  it('second page (cursor) returns pinned: []', async () => {
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const author = await insertUser(db, { orgId, role: 'member' });
    await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      pinned: { byUserId: mod.id, durationDays: 7 },
    });
    const plain = await insertPost(db, { authorId: author.id, orgId, status: 'published' });

    const feed = await fetchFeed(db, {
      filter: 'all',
      limit: 50,
      cursor: encodeCursor({ filter: 'all', id: plain.id }),
      callerRole: 'member',
      callerId: author.id,
      orgId,
    });
    expect(feed.pinned).toEqual([]);
  });

  it('pinned post past pin_until is excluded from pinned[] defensively', async () => {
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const author = await insertUser(db, { orgId, role: 'member' });
    const { id } = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      pinned: { byUserId: mod.id, durationDays: 7 },
    });
    await db
      .updateTable('posts')
      .set({ pin_until: new Date(Date.now() - 60_000) })
      .where('id', '=', id)
      .execute();
    const feed = await fetchFeed(db, {
      filter: 'all',
      limit: 50,
      callerRole: 'member',
      callerId: author.id,
      orgId,
    });
    expect(feed.pinned.map((p) => p.id)).toEqual([]);
    // It should appear in chronological since pin_until has passed.
    expect(feed.posts.map((p) => p.id)).toContain(id);
  });
});
