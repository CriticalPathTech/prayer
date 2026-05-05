import type { Database } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { prayerCountRecomputer } from '../../src/services/prayer-consumer.js';
import { insertOrg, insertPost, insertUser } from '../helpers/seed.js';

describe('prayerCountRecomputer', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'testchurch-svc-prayer-consumer' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('prayers').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('recomputes posts.prayer_count via COUNT(*)', async () => {
    const u1 = await insertUser(db, { orgId });
    const u2 = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: u1.id, orgId, status: 'published' });
    await db
      .insertInto('prayers')
      .values([
        { id: newId(), org_id: orgId, post_id: post.id, user_id: u1.id },
        { id: newId(), org_id: orgId, post_id: post.id, user_id: u2.id },
      ])
      .execute();

    await db.transaction().execute(async (trx) => {
      await prayerCountRecomputer(
        {
          id: newId(),
          org_id: orgId,
          type: 'prayer.added',
          post_id: post.id,
          actor_id: u1.id,
          payload: { post_id: post.id },
        },
        trx,
      );
    });
    const row = await db
      .selectFrom('posts')
      .select('prayer_count')
      .where('id', '=', post.id)
      .executeTakeFirstOrThrow();
    expect(row.prayer_count).toBe(2);
  });

  it('is idempotent', async () => {
    const u1 = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: u1.id, orgId, status: 'published' });
    await db
      .insertInto('prayers')
      .values({ id: newId(), org_id: orgId, post_id: post.id, user_id: u1.id })
      .execute();
    for (let i = 0; i < 2; i++) {
      await db.transaction().execute(async (trx) => {
        await prayerCountRecomputer(
          {
            id: newId(),
            org_id: orgId,
            type: 'prayer.added',
            post_id: post.id,
            actor_id: u1.id,
            payload: { post_id: post.id },
          },
          trx,
        );
      });
    }
    const row = await db
      .selectFrom('posts')
      .select('prayer_count')
      .where('id', '=', post.id)
      .executeTakeFirstOrThrow();
    expect(row.prayer_count).toBe(1);
  });
});
