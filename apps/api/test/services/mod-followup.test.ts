import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { listFollowupPosts } from '../../src/services/mod-followup.js';
import { insertComment, insertPost, insertUser } from '../helpers/seed.js';

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
  afterEach(async () => {
    await db.deleteFrom('comments').execute();
    await db.deleteFrom('posts').execute();
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

  it('no_prayers=true returns only posts with prayer_count=0', async () => {
    const author = await insertUser(db, { orgId, role: 'member' });
    const zero = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: 'untouched',
    });
    const some = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: 'prayed for',
    });
    await db.updateTable('posts').set({ prayer_count: 3 }).where('id', '=', some.id).execute();

    const out = await listFollowupPosts(db, {
      callerRole: 'moderator',
      callerId: author.id,
      orgId,
      filters: {
        noPrayers: true,
        noReactions: false,
        noComments: false,
        noUpdates: false,
        noModResponse: false,
      },
      minAge: { value: 0, unit: 'days' },
      sort: 'oldest',
      limit: 20,
    });
    expect(out.items.map((p) => p.id)).toEqual([zero.id]);
  });

  it('no_reactions=true returns only posts with reaction_count=0', async () => {
    const author = await insertUser(db, { orgId, role: 'member' });
    const zero = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const some = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await db.updateTable('posts').set({ reaction_count: 2 }).where('id', '=', some.id).execute();

    const out = await listFollowupPosts(db, {
      callerRole: 'moderator',
      callerId: author.id,
      orgId,
      filters: {
        noPrayers: false,
        noReactions: true,
        noComments: false,
        noUpdates: false,
        noModResponse: false,
      },
      minAge: { value: 0, unit: 'days' },
      sort: 'oldest',
      limit: 20,
    });
    expect(out.items.map((p) => p.id)).toEqual([zero.id]);
  });

  it('no_comments=true excludes posts with any non-hidden comment', async () => {
    const author = await insertUser(db, { orgId, role: 'member' });
    const responder = await insertUser(db, { orgId, role: 'member' });
    const orphan = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: 'no replies',
    });
    const replied = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: 'has reply',
    });
    await insertComment(db, { postId: replied.id, authorId: responder.id, orgId });

    const out = await listFollowupPosts(db, {
      callerRole: 'moderator',
      callerId: author.id,
      orgId,
      filters: {
        noPrayers: false,
        noReactions: false,
        noComments: true,
        noUpdates: false,
        noModResponse: false,
      },
      minAge: { value: 0, unit: 'days' },
      sort: 'oldest',
      limit: 20,
    });
    expect(out.items.map((p) => p.id)).toEqual([orphan.id]);
  });

  it('no_comments=true treats hidden comments as if they do not exist', async () => {
    const author = await insertUser(db, { orgId, role: 'member' });
    const responder = await insertUser(db, { orgId, role: 'member' });
    const only_hidden = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await insertComment(db, {
      postId: only_hidden.id,
      authorId: responder.id,
      orgId,
      isHidden: true,
    });

    const out = await listFollowupPosts(db, {
      callerRole: 'moderator',
      callerId: author.id,
      orgId,
      filters: {
        noPrayers: false,
        noReactions: false,
        noComments: true,
        noUpdates: false,
        noModResponse: false,
      },
      minAge: { value: 0, unit: 'days' },
      sort: 'oldest',
      limit: 20,
    });
    expect(out.items.map((p) => p.id)).toContain(only_hidden.id);
  });
});
