import { newId } from '@prayer/db';
import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { clearSnapshotCache } from '../../src/services/feed-snapshot.js';
import { mintTestJwt } from '../helpers/jwt.js';
import { getTestchurchOrgId, insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('GET /feed', () => {
  let ctx: TestApp;
  let orgId: string;
  beforeAll(async () => {
    ctx = await createTestApp();
    orgId = ctx.orgId;
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    clearSnapshotCache();
    await ctx.db.deleteFrom('events').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('excludes drafts and archived', async () => {
    const user = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    await insertPost(ctx.db, { authorId: user.id, orgId, status: 'published' });
    await insertPost(ctx.db, { authorId: user.id, orgId, status: 'draft' });
    await insertPost(ctx.db, { authorId: user.id, orgId, status: 'archived' });
    const res = await request(ctx.app)
      .get('/feed?filter=all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].status).toBe('published');
    expect(res.body.snapshotId).toBe(res.body.posts[0].id);
  });

  it("author's own pending post appears in their feed", async () => {
    const author = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: author.supabaseAuthId, email: author.email });
    const pending = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'pending' });
    const res = await request(ctx.app)
      .get('/feed?filter=all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].id).toBe(pending.id);
    expect(res.body.posts[0].status).toBe('pending');
  });

  it("another member cannot see the author's pending post", async () => {
    const author = await insertUser(ctx.db, { orgId });
    const other = await insertUser(ctx.db, { orgId });
    const otherToken = await mintTestJwt({ sub: other.supabaseAuthId, email: other.email });
    await insertPost(ctx.db, { authorId: author.id, orgId, status: 'pending' });
    const res = await request(ctx.app)
      .get('/feed?filter=all')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(0);
  });

  it('moderator does not see pending posts on the wall (only via /mod/approvals)', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const moderator = await insertUser(ctx.db, { orgId, role: 'moderator' });
    const modToken = await mintTestJwt({ sub: moderator.supabaseAuthId, email: moderator.email });
    await insertPost(ctx.db, { authorId: author.id, orgId, status: 'pending' });
    const res = await request(ctx.app)
      .get('/feed?filter=all')
      .set('Authorization', `Bearer ${modToken}`);
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(0);
  });

  it('excludes hidden posts for members', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const member = await insertUser(ctx.db, { orgId });
    await insertPost(ctx.db, { authorId: author.id, orgId, status: 'hidden' });
    await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    const token = await mintTestJwt({ sub: member.supabaseAuthId, email: member.email });
    const res = await request(ctx.app)
      .get('/feed?filter=all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].status).toBe('published');
  });

  it('includes hidden posts for moderators with hidden_by attribution', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const moderator = await insertUser(ctx.db, { orgId, role: 'moderator' });
    const hidden = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'hidden' });
    // Write the moderator.hide event that the DTO will look up.
    await ctx.db
      .insertInto('events')
      .values({
        id: newId(),
        org_id: orgId,
        type: 'moderator.hide',
        post_id: hidden.id,
        actor_id: moderator.id,
        payload: {
          target_type: 'post',
          target_id: hidden.id,
          source: 'manual',
        } as never,
      })
      .execute();
    const token = await mintTestJwt({ sub: moderator.supabaseAuthId, email: moderator.email });
    const res = await request(ctx.app)
      .get('/feed?filter=all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const row = res.body.posts.find((p: { id: string }) => p.id === hidden.id);
    expect(row).toBeDefined();
    expect(row.status).toBe('hidden');
    expect(row.hidden_source).toBe('manual');
    expect(row.hidden_by).toEqual({
      id: moderator.id,
      display_name: moderator.email.split('@')[0],
    });
  });

  it('includes auto-hidden posts for moderators with null hidden_by', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const moderator = await insertUser(ctx.db, { orgId, role: 'moderator' });
    const hidden = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'hidden' });
    // Auto-hide event: actor_id is null, source is 'auto'.
    await ctx.db
      .insertInto('events')
      .values({
        id: newId(),
        org_id: orgId,
        type: 'moderator.hide',
        post_id: hidden.id,
        actor_id: null,
        payload: {
          target_type: 'post',
          target_id: hidden.id,
          source: 'auto',
        } as never,
      })
      .execute();
    const token = await mintTestJwt({ sub: moderator.supabaseAuthId, email: moderator.email });
    const res = await request(ctx.app)
      .get('/feed?filter=all')
      .set('Authorization', `Bearer ${token}`);
    const row = res.body.posts.find((p: { id: string }) => p.id === hidden.id);
    expect(row).toBeDefined();
    expect(row.status).toBe('hidden');
    expect(row.hidden_source).toBe('auto');
    expect(row.hidden_by).toBeNull();
  });

  it('excludes update posts (only originals)', async () => {
    const user = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const parent = await insertPost(ctx.db, { authorId: user.id, orgId, status: 'published' });
    await insertPost(ctx.db, {
      authorId: user.id,
      orgId,
      status: 'published',
      parentId: parent.id,
    });
    const res = await request(ctx.app)
      .get('/feed?filter=all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].id).toBe(parent.id);
  });

  it('all: paginates by cursor', async () => {
    const user = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    for (let i = 0; i < 3; i++) {
      await insertPost(ctx.db, { authorId: user.id, orgId, status: 'published' });
    }
    const first = await request(ctx.app)
      .get('/feed?filter=all&limit=2')
      .set('Authorization', `Bearer ${token}`);
    expect(first.body.posts).toHaveLength(2);
    expect(first.body.nextCursor).toBeDefined();
    const second = await request(ctx.app)
      .get(`/feed?filter=all&limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(second.body.posts).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
  });

  it('rejects limit > 50', async () => {
    const user = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .get('/feed?filter=all&limit=100')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('rejects bad filter', async () => {
    const user = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .get('/feed?filter=weird')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('mine: only returns posts authored by the caller', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const other = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: author.supabaseAuthId, email: author.email });
    const mine = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    await insertPost(ctx.db, { authorId: other.id, orgId, status: 'published' });
    const res = await request(ctx.app)
      .get('/feed?filter=mine')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].id).toBe(mine.id);
  });

  it('answered: only returns parents flagged answered and embeds every answered update chronologically', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: author.supabaseAuthId, email: author.email });
    const pending = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    const answered = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    await ctx.db
      .updateTable('posts')
      .set({ is_answered_prayer: true })
      .where('id', '=', answered.id)
      .execute();
    const earlierUpdate = await insertPost(ctx.db, {
      authorId: author.id,
      orgId,
      status: 'published',
      parentId: answered.id,
      body: 'interim',
    });
    await ctx.db
      .updateTable('posts')
      .set({ is_answered_prayer: true })
      .where('id', '=', earlierUpdate.id)
      .execute();
    const laterUpdate = await insertPost(ctx.db, {
      authorId: author.id,
      orgId,
      status: 'published',
      parentId: answered.id,
      body: 'answered!',
    });
    await ctx.db
      .updateTable('posts')
      .set({ is_answered_prayer: true })
      .where('id', '=', laterUpdate.id)
      .execute();
    const res = await request(ctx.app)
      .get('/feed?filter=answered')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.posts.map((p: { id: string }) => p.id)).toEqual([answered.id]);
    expect(res.body.posts.map((p: { id: string }) => p.id)).not.toContain(pending.id);
    const updates = res.body.posts[0].updates;
    expect(updates).toHaveLength(2);
    // Chronological order: oldest → newest.
    expect(updates[0].id).toBe(earlierUpdate.id);
    expect(updates[0].body).toBe('interim');
    expect(updates[1].id).toBe(laterUpdate.id);
    expect(updates[1].body).toBe('answered!');
  });

  it('all: updates is an empty array when the parent has no children', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: author.supabaseAuthId, email: author.email });
    await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    const res = await request(ctx.app)
      .get('/feed?filter=all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.posts[0].updates).toEqual([]);
  });

  it('answered: does not embed archived or hidden update posts', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: author.supabaseAuthId, email: author.email });
    const answered = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    await ctx.db
      .updateTable('posts')
      .set({ is_answered_prayer: true })
      .where('id', '=', answered.id)
      .execute();
    // Archived answered update — should be excluded from the updates embed
    const archivedUpdate = await insertPost(ctx.db, {
      authorId: author.id,
      orgId,
      status: 'archived',
      parentId: answered.id,
      body: 'archived update body',
    });
    await ctx.db
      .updateTable('posts')
      .set({ is_answered_prayer: true })
      .where('id', '=', archivedUpdate.id)
      .execute();
    const res = await request(ctx.app)
      .get('/feed?filter=answered')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Parent returned because its own is_answered_prayer=true, but the archived
    // child must not surface as an embedded update.
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].id).toBe(answered.id);
    expect(res.body.posts[0].updates).toEqual([]);
  });

  it('all: returns inline updates for every parent in chronological order', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: author.supabaseAuthId, email: author.email });
    const parent = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    const u1 = await insertPost(ctx.db, {
      authorId: author.id,
      orgId,
      status: 'published',
      parentId: parent.id,
      body: 'first',
    });
    const u2 = await insertPost(ctx.db, {
      authorId: author.id,
      orgId,
      status: 'published',
      parentId: parent.id,
      body: 'second',
    });
    const res = await request(ctx.app)
      .get('/feed?filter=all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const updates = res.body.posts[0].updates;
    expect(updates).toHaveLength(2);
    expect(updates[0].id).toBe(u1.id);
    expect(updates[0].body).toBe('first');
    expect(updates[1].id).toBe(u2.id);
    expect(updates[1].body).toBe('second');
  });

  it('mine: updates field is populated for own posts too', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: author.supabaseAuthId, email: author.email });
    const parent = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    await insertPost(ctx.db, {
      authorId: author.id,
      orgId,
      status: 'published',
      parentId: parent.id,
      body: 'mine update',
    });
    const res = await request(ctx.app)
      .get('/feed?filter=mine')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.posts[0].updates).toHaveLength(1);
    expect(res.body.posts[0].updates[0].body).toBe('mine update');
  });

  it('member does not see a hidden child update inline', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const viewer = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: viewer.supabaseAuthId, email: viewer.email });
    const parent = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    await insertPost(ctx.db, {
      authorId: author.id,
      orgId,
      status: 'hidden',
      parentId: parent.id,
      body: 'should not appear',
    });
    await insertPost(ctx.db, {
      authorId: author.id,
      orgId,
      status: 'published',
      parentId: parent.id,
      body: 'visible update',
    });
    const res = await request(ctx.app)
      .get('/feed?filter=all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.posts[0].updates).toHaveLength(1);
    expect(res.body.posts[0].updates[0].body).toBe('visible update');
  });

  it('moderator sees a hidden child update inline with hidden_by attribution', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const moderator = await insertUser(ctx.db, { orgId, role: 'moderator' });
    const token = await mintTestJwt({ sub: moderator.supabaseAuthId, email: moderator.email });
    const parent = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    const hiddenUpdate = await insertPost(ctx.db, {
      authorId: author.id,
      orgId,
      status: 'hidden',
      parentId: parent.id,
      body: 'hidden body',
    });
    await ctx.db
      .insertInto('events')
      .values({
        id: newId(),
        org_id: orgId,
        type: 'moderator.hide',
        post_id: hiddenUpdate.id,
        actor_id: moderator.id,
        payload: {
          target_type: 'post',
          target_id: hiddenUpdate.id,
          source: 'manual',
        } as never,
      })
      .execute();
    const res = await request(ctx.app)
      .get('/feed?filter=all')
      .set('Authorization', `Bearer ${token}`);
    const updates = res.body.posts[0].updates;
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe(hiddenUpdate.id);
    expect(updates[0].status).toBe('hidden');
    expect(updates[0].hidden_source).toBe('manual');
    expect(updates[0].hidden_by).toEqual({
      id: moderator.id,
      display_name: moderator.email.split('@')[0],
    });
  });
});

describe('GET /feed/snapshot', () => {
  let ctx: TestApp;
  let orgId: string;
  beforeAll(async () => {
    ctx = await createTestApp();
    orgId = ctx.orgId;
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    clearSnapshotCache();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('returns zero-uuid when no published posts exist', async () => {
    const user = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .get('/feed/snapshot')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.snapshotId).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('returns the max published post id', async () => {
    const user = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    await insertPost(ctx.db, { authorId: user.id, orgId, status: 'draft' });
    const published = await insertPost(ctx.db, { authorId: user.id, orgId, status: 'published' });
    const res = await request(ctx.app)
      .get('/feed/snapshot')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.snapshotId).toBe(published.id);
  });
});

describe('GET /feed — M5 prayed flag', () => {
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
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('feed rows include prayed:true when caller prayed the post', async () => {
    const author = await insertUser(db, { orgId });
    const caller = await insertUser(db, { orgId });
    const p1 = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const p2 = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await db
      .insertInto('prayers')
      .values({ id: newId(), org_id: orgId, post_id: p1.id, user_id: caller.id })
      .execute();

    const ctx = await createTestApp();
    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const res = await request(ctx.app)
      .get('/feed?filter=all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const p1Row = res.body.posts.find((x: { id: string }) => x.id === p1.id);
    const p2Row = res.body.posts.find((x: { id: string }) => x.id === p2.id);
    expect(p1Row.prayed).toBe(true);
    expect(p2Row.prayed).toBe(false);
  });
});
