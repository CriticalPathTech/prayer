import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { listFollowupPosts } from '../../src/services/mod-followup.js';
import { insertPost, insertUser } from '../helpers/seed.js';

describe('listFollowupPosts', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = (
      await db
        .selectFrom('orgs')
        .select('id')
        .where('slug', '=', 'testchurch')
        .executeTakeFirstOrThrow()
    ).id;
  });
  afterAll(async () => {
    await db.deleteFrom('comments').execute();
    await db.deleteFrom('posts').execute();
    await db.destroy();
  });

  it('returns all published top-level posts oldest-first when no filters set', async () => {
    const author = await insertUser(db, { orgId, role: 'member' });
    const a = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: 'first',
    });
    await new Promise((r) => setTimeout(r, 5));
    const b = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: 'second',
    });

    const out = await listFollowupPosts(db, {
      callerRole: 'moderator',
      callerId: author.id,
      orgId,
      filters: {
        noPrayers: false,
        noReactions: false,
        noComments: false,
        noUpdates: false,
        noModResponse: false,
      },
      minAge: { value: 0, unit: 'days' },
      sort: 'oldest',
      limit: 20,
    });

    expect(out.items.map((p) => p.id)).toEqual([a.id, b.id]);
    expect(out.next_cursor).toBeNull();
  });
});
