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

  it('no_updates=true excludes posts that have any published child update', async () => {
    const author = await insertUser(db, { orgId, role: 'member' });
    const stalled = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: 'no update',
    });
    const updated = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: 'updated',
    });
    await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      parentId: updated.id,
      body: 'update!',
    });

    const out = await listFollowupPosts(db, {
      callerRole: 'moderator',
      callerId: author.id,
      orgId,
      filters: {
        noPrayers: false,
        noReactions: false,
        noComments: false,
        noUpdates: true,
        noModResponse: false,
      },
      minAge: { value: 0, unit: 'days' },
      sort: 'oldest',
      limit: 20,
    });
    expect(out.items.map((p) => p.id)).toEqual([stalled.id]);
  });

  it('no_mod_response=true excludes posts where any comment author has mod or super_user role', async () => {
    const author = await insertUser(db, { orgId, role: 'member' });
    const peer = await insertUser(db, { orgId, role: 'member' });
    const mod = await insertUser(db, { orgId, role: 'moderator' });

    const onlyPeer = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: 'peer commented',
    });
    await insertComment(db, { postId: onlyPeer.id, authorId: peer.id, orgId });

    const modReplied = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: 'mod commented',
    });
    await insertComment(db, { postId: modReplied.id, authorId: mod.id, orgId });

    const out = await listFollowupPosts(db, {
      callerRole: 'moderator',
      callerId: author.id,
      orgId,
      filters: {
        noPrayers: false,
        noReactions: false,
        noComments: false,
        noUpdates: false,
        noModResponse: true,
      },
      minAge: { value: 0, unit: 'days' },
      sort: 'oldest',
      limit: 20,
    });
    expect(out.items.map((p) => p.id)).toEqual([onlyPeer.id]);
  });

  it('min_age_value=7 unit=days excludes posts younger than 7 days', async () => {
    const author = await insertUser(db, { orgId, role: 'member' });
    const fresh = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: 'today',
    });
    const aged = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: '10 days ago',
    });
    await db
      .updateTable('posts')
      .set({ created_at: new Date(Date.now() - 10 * 24 * 3600_000) })
      .where('id', '=', aged.id)
      .execute();

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
      minAge: { value: 7, unit: 'days' },
      sort: 'oldest',
      limit: 20,
    });
    expect(out.items.map((p) => p.id)).toEqual([aged.id]);
    expect(out.items.map((p) => p.id)).not.toContain(fresh.id);
  });

  it('min_age_value=24 unit=hours excludes posts younger than 24 hours', async () => {
    const author = await insertUser(db, { orgId, role: 'member' });
    const fresh = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: 'recent',
    });
    const aged = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: '2 days ago',
    });
    await db
      .updateTable('posts')
      .set({ created_at: new Date(Date.now() - 2 * 24 * 3600_000) })
      .where('id', '=', aged.id)
      .execute();

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
      minAge: { value: 24, unit: 'hours' },
      sort: 'oldest',
      limit: 20,
    });
    expect(out.items.map((p) => p.id)).toEqual([aged.id]);
    expect(out.items.map((p) => p.id)).not.toContain(fresh.id);
  });

  it('sort=newest returns rows newest-first', async () => {
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
      sort: 'newest',
      limit: 20,
    });
    expect(out.items.map((p) => p.id)).toEqual([b.id, a.id]);
  });

  it('cursor pagination round-trips without overlap or gaps', async () => {
    const author = await insertUser(db, { orgId, role: 'member' });
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const p = await insertPost(db, {
        authorId: author.id,
        orgId,
        status: 'published',
        body: `p${i}`,
      });
      ids.push(p.id);
      await new Promise((r) => setTimeout(r, 2));
    }

    const page1 = await listFollowupPosts(db, {
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
      limit: 2,
    });
    expect(page1.items.map((p) => p.id)).toEqual(ids.slice(0, 2));
    expect(page1.next_cursor).not.toBeNull();

    const page2 = await listFollowupPosts(db, {
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
      limit: 2,
      cursor: page1.next_cursor!,
    });
    expect(page2.items.map((p) => p.id)).toEqual(ids.slice(2, 4));

    const page3 = await listFollowupPosts(db, {
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
      limit: 2,
      cursor: page2.next_cursor!,
    });
    expect(page3.items.map((p) => p.id)).toEqual([ids[4]]);
    expect(page3.next_cursor).toBeNull();
  });
});
