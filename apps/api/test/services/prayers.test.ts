import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { NotFoundError } from '../../src/middleware/error.js';
import { togglePrayer } from '../../src/services/prayers.js';
import { insertPost, insertUser } from '../helpers/seed.js';

describe('togglePrayer', () => {
  let db: Kysely<Database>;
  beforeAll(() => {
    db = initDb(process.env.TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('prayers').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('users').execute();
  });

  it('adds then removes on second call', async () => {
    const author = await insertUser(db);
    const prayer = await insertUser(db);
    const post = await insertPost(db, { authorId: author.id, status: 'published' });

    const a = await togglePrayer(db, { callerId: prayer.id, postId: post.id });
    expect(a.prayed).toBe(true);
    const b = await togglePrayer(db, { callerId: prayer.id, postId: post.id });
    expect(b.prayed).toBe(false);
    const rows = await db.selectFrom('prayers').selectAll().execute();
    expect(rows).toHaveLength(0);
  });

  it('emits prayer.added then prayer.removed events', async () => {
    const author = await insertUser(db);
    const post = await insertPost(db, { authorId: author.id, status: 'published' });
    await togglePrayer(db, { callerId: author.id, postId: post.id });
    await togglePrayer(db, { callerId: author.id, postId: post.id });
    const events = await db
      .selectFrom('events')
      .select('type')
      .orderBy('created_at', 'asc')
      .execute();
    expect(events.map((e) => e.type)).toEqual(['prayer.added', 'prayer.removed']);
  });

  it('throws NotFoundError on missing or draft post', async () => {
    const author = await insertUser(db);
    const draft = await insertPost(db, { authorId: author.id, status: 'draft' });
    await expect(
      togglePrayer(db, { callerId: author.id, postId: draft.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
