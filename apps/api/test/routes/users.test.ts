import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { mintTestJwt } from '../helpers/jwt.js';
import { insertOrg, insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('GET /users/:userId', () => {
  let ctx: TestApp;
  let orgId: string;
  let otherOrgId: string;
  beforeAll(async () => {
    ctx = await createTestApp();
    orgId = ctx.orgId;
    otherOrgId = await insertOrg(ctx.db, { slug: 'users-route-other-org' });
  });
  afterAll(async () => {
    await ctx.db.deleteFrom('user_orgs').where('org_id', '=', otherOrgId).execute();
    await ctx.db.deleteFrom('orgs').where('id', '=', otherOrgId).execute();
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.db.deleteFrom('events').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('user_orgs').where('org_id', '!=', otherOrgId).execute();
    // Keep orgB row but clear its memberships so the next test starts clean.
    await ctx.db.deleteFrom('user_orgs').where('org_id', '=', otherOrgId).execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('returns the target user dto for a same-org member caller', async () => {
    const caller = await insertUser(ctx.db, { orgId });
    const target = await insertUser(ctx.db, {
      orgId,
      displayName: 'Target Person',
    });
    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const res = await request(ctx.app)
      .get(`/users/${target.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: target.id,
      display_name: 'Target Person',
      avatar_url: null,
      role: 'member',
    });
    // Email must never leak through the public profile endpoint.
    expect(res.body.email).toBeUndefined();
  });

  it('returns 404 when the target belongs only to a different org', async () => {
    const caller = await insertUser(ctx.db, { orgId });
    // Target is a member of a different org only — invisible to caller in orgA.
    const target = await insertUser(ctx.db, { orgId: otherOrgId });
    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const res = await request(ctx.app)
      .get(`/users/${target.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a nonexistent user id', async () => {
    const caller = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const ghostId = '00000000-0000-4000-8000-000000000000';
    const res = await request(ctx.app)
      .get(`/users/${ghostId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 401 without an Authorization header', async () => {
    const target = await insertUser(ctx.db, { orgId });
    const res = await request(ctx.app).get(`/users/${target.id}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /users/:userId/posts', () => {
  let ctx: TestApp;
  let orgId: string;
  let otherOrgId: string;
  beforeAll(async () => {
    ctx = await createTestApp();
    orgId = ctx.orgId;
    otherOrgId = await insertOrg(ctx.db, { slug: 'users-posts-route-other-org' });
  });
  afterAll(async () => {
    await ctx.db.deleteFrom('user_orgs').where('org_id', '=', otherOrgId).execute();
    await ctx.db.deleteFrom('orgs').where('id', '=', otherOrgId).execute();
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.db.deleteFrom('events').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('returns the target user posts newest first', async () => {
    const caller = await insertUser(ctx.db, { orgId });
    const target = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const p1 = await insertPost(ctx.db, {
      authorId: target.id,
      orgId,
      status: 'published',
      body: 'first',
    });
    const p2 = await insertPost(ctx.db, {
      authorId: target.id,
      orgId,
      status: 'published',
      body: 'second',
    });
    const res = await request(ctx.app)
      .get(`/users/${target.id}/posts`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.posts.map((p: { id: string }) => p.id)).toEqual([p2.id, p1.id]);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.snapshotId).toBe(p2.id);
  });

  it('returns 404 when the target belongs only to a different org', async () => {
    const caller = await insertUser(ctx.db, { orgId });
    const target = await insertUser(ctx.db, { orgId: otherOrgId });
    await insertPost(ctx.db, {
      authorId: target.id,
      orgId: otherOrgId,
      status: 'published',
    });
    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const res = await request(ctx.app)
      .get(`/users/${target.id}/posts`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a nonexistent user id', async () => {
    const caller = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const ghostId = '00000000-0000-4000-8000-000000000000';
    const res = await request(ctx.app)
      .get(`/users/${ghostId}/posts`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 401 without an Authorization header', async () => {
    const target = await insertUser(ctx.db, { orgId });
    const res = await request(ctx.app).get(`/users/${target.id}/posts`);
    expect(res.status).toBe(401);
  });

  it('paginates via cursor without overlap; last page nextCursor is null', async () => {
    const caller = await insertUser(ctx.db, { orgId });
    const target = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const p = await insertPost(ctx.db, {
        authorId: target.id,
        orgId,
        status: 'published',
        body: `p${i}`,
      });
      ids.push(p.id);
    }
    const expected = [...ids].reverse(); // newest-first

    const first = await request(ctx.app)
      .get(`/users/${target.id}/posts?limit=2`)
      .set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.posts.map((p: { id: string }) => p.id)).toEqual(expected.slice(0, 2));
    expect(first.body.nextCursor).toBeTruthy();

    const second = await request(ctx.app)
      .get(`/users/${target.id}/posts?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.posts.map((p: { id: string }) => p.id)).toEqual(expected.slice(2, 4));
    expect(second.body.nextCursor).toBeTruthy();

    // Verify no overlap between page 1 and page 2.
    const firstIds = new Set(first.body.posts.map((p: { id: string }) => p.id));
    for (const p of second.body.posts) {
      expect(firstIds.has(p.id)).toBe(false);
    }

    const third = await request(ctx.app)
      .get(`/users/${target.id}/posts?limit=2&cursor=${encodeURIComponent(second.body.nextCursor)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(third.status).toBe(200);
    expect(third.body.posts.map((p: { id: string }) => p.id)).toEqual(expected.slice(4));
    expect(third.body.nextCursor).toBeNull();
  });

  it('default limit returns up to 20 posts when none specified', async () => {
    const caller = await insertUser(ctx.db, { orgId });
    const target = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    for (let i = 0; i < 21; i++) {
      await insertPost(ctx.db, {
        authorId: target.id,
        orgId,
        status: 'published',
        body: `p${i}`,
      });
    }
    const res = await request(ctx.app)
      .get(`/users/${target.id}/posts`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(20);
    expect(res.body.nextCursor).toBeTruthy();
  });

  it('rejects invalid limit with 400', async () => {
    const caller = await insertUser(ctx.db, { orgId });
    const target = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const res = await request(ctx.app)
      .get(`/users/${target.id}/posts?limit=foo`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('moderator does not see the target user’s anonymous posts', async () => {
    // Smoke-test that callerRole propagates from route to service. Anonymity
    // matrix is exhaustively covered in the service tests; here we just need to
    // confirm a moderator request behaves like a non-self non-super_user caller.
    const moderator = await insertUser(ctx.db, { orgId, role: 'moderator' });
    const target = await insertUser(ctx.db, { orgId });
    const token = await mintTestJwt({
      sub: moderator.supabaseAuthId,
      email: moderator.email,
    });
    await insertPost(ctx.db, {
      authorId: target.id,
      orgId,
      status: 'published',
      isAnonymous: true,
    });
    const res = await request(ctx.app)
      .get(`/users/${target.id}/posts`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(0);
  });
});
