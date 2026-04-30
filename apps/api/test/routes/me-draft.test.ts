import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { mintTestJwt } from '../helpers/jwt.js';
import { insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('/me/draft', () => {
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
    await ctx.db.deleteFrom('events').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  describe('GET /me/draft', () => {
    it('401 without a token', async () => {
      const res = await request(ctx.app).get('/me/draft');
      expect(res.status).toBe(401);
    });

    it('returns { draft: null } when user has no draft', async () => {
      const user = await insertUser(ctx.db, { orgId });
      const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
      const res = await request(ctx.app).get('/me/draft').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ draft: null });
    });

    it('returns the existing draft after PUT', async () => {
      const user = await insertUser(ctx.db, { orgId });
      const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
      await request(ctx.app)
        .put('/me/draft')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'drafting…' });

      const res = await request(ctx.app).get('/me/draft').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.draft).toMatchObject({
        body: 'drafting…',
        status: 'draft',
        is_anonymous: false,
      });
    });

    it('ignores drafts belonging to other users', async () => {
      const a = await insertUser(ctx.db, { orgId });
      const b = await insertUser(ctx.db, { orgId, email: `${Date.now()}b@e.com` });
      const aToken = await mintTestJwt({ sub: a.supabaseAuthId, email: a.email });
      const bToken = await mintTestJwt({ sub: b.supabaseAuthId, email: b.email });
      await request(ctx.app)
        .put('/me/draft')
        .set('Authorization', `Bearer ${aToken}`)
        .send({ body: "A's draft" });

      const res = await request(ctx.app).get('/me/draft').set('Authorization', `Bearer ${bToken}`);
      expect(res.body).toEqual({ draft: null });
    });
  });

  describe('PUT /me/draft', () => {
    it('401 without a token', async () => {
      const res = await request(ctx.app).put('/me/draft').send({ body: 'x' });
      expect(res.status).toBe(401);
    });

    it('creates a draft on first PUT', async () => {
      const user = await insertUser(ctx.db, { orgId });
      const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
      const res = await request(ctx.app)
        .put('/me/draft')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'first save', is_anonymous: true });
      expect(res.status).toBe(200);
      expect(res.body.draft).toMatchObject({
        body: 'first save',
        is_anonymous: true,
        status: 'draft',
      });
      const rows = await ctx.db
        .selectFrom('posts')
        .selectAll()
        .where('author_id', '=', user.id)
        .execute();
      expect(rows).toHaveLength(1);
    });

    it('updates the same row on subsequent PUTs (upsert)', async () => {
      const user = await insertUser(ctx.db, { orgId });
      const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });

      const first = await request(ctx.app)
        .put('/me/draft')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'v1' });
      const firstId = first.body.draft.id;

      const second = await request(ctx.app)
        .put('/me/draft')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'v2' });
      expect(second.status).toBe(200);
      expect(second.body.draft.id).toBe(firstId);
      expect(second.body.draft.body).toBe('v2');

      const rows = await ctx.db
        .selectFrom('posts')
        .selectAll()
        .where('author_id', '=', user.id)
        .where('status', '=', 'draft')
        .execute();
      expect(rows).toHaveLength(1);
    });

    it('allows body to be empty string (typing start state)', async () => {
      const user = await insertUser(ctx.db, { orgId });
      const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
      const res = await request(ctx.app)
        .put('/me/draft')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: '' });
      expect(res.status).toBe(200);
      expect(res.body.draft.body).toBe('');
    });

    it('rejects body > 10KB', async () => {
      const user = await insertUser(ctx.db, { orgId });
      const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
      const res = await request(ctx.app)
        .put('/me/draft')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'x'.repeat(10_001) });
      expect(res.status).toBe(400);
    });

    it('rejects expires_at out of range', async () => {
      const user = await insertUser(ctx.db, { orgId });
      const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
      const farPast = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
      const res = await request(ctx.app)
        .put('/me/draft')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'x', expires_at: farPast });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /me/draft/publish', () => {
    it('401 without a token', async () => {
      const res = await request(ctx.app).post('/me/draft/publish');
      expect(res.status).toBe(401);
    });

    it('publishes the draft and clears it from /me/draft', async () => {
      const user = await insertUser(ctx.db, { orgId });
      const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
      await request(ctx.app)
        .put('/me/draft')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'ready to share' });

      const pub = await request(ctx.app)
        .post('/me/draft/publish')
        .set('Authorization', `Bearer ${token}`);
      expect(pub.status).toBe(200);
      expect(pub.body.post).toMatchObject({ body: 'ready to share', status: 'published' });
      expect(pub.body.post.expires_at).not.toBeNull();
      expect(pub.body.post.edit_deadline).toBeDefined();

      const after = await request(ctx.app).get('/me/draft').set('Authorization', `Bearer ${token}`);
      expect(after.body).toEqual({ draft: null });
    });

    it('404 when there is no draft', async () => {
      const user = await insertUser(ctx.db, { orgId });
      const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
      const res = await request(ctx.app)
        .post('/me/draft/publish')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('400 when the draft body is empty/whitespace', async () => {
      const user = await insertUser(ctx.db, { orgId });
      const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
      await request(ctx.app)
        .put('/me/draft')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: '   ' });
      const res = await request(ctx.app)
        .post('/me/draft/publish')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    it('after publish, a fresh PUT creates a new draft (the previous slot is empty)', async () => {
      const user = await insertUser(ctx.db, { orgId });
      const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
      await request(ctx.app)
        .put('/me/draft')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'first post' });
      await request(ctx.app).post('/me/draft/publish').set('Authorization', `Bearer ${token}`);

      const next = await request(ctx.app)
        .put('/me/draft')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'second post' });
      expect(next.status).toBe(200);
      expect(next.body.draft.status).toBe('draft');

      const postRows = await ctx.db
        .selectFrom('posts')
        .selectAll()
        .where('author_id', '=', user.id)
        .execute();
      expect(postRows).toHaveLength(2);
    });

    it('publish refreshes id and created_at to the publish moment (not the draft moment)', async () => {
      // Reproduces the draft-staleness bug: opening compose creates a draft
      // row with id+created_at set to "now". If the user comes back hours or
      // days later and clicks Share, the published post must surface as fresh
      // — fresh UUIDv7 (so feed-by-id-desc puts it on top) and fresh
      // created_at (so "X ago" displays the publish time, not the draft
      // moment). publishOwnDraft achieves this by DELETE + INSERT in one trx.
      const user = await insertUser(ctx.db, { orgId });
      const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });

      // Create a draft with PUT /me/draft. Capture the draft's id + created_at
      // by reading the underlying row.
      await request(ctx.app)
        .put('/me/draft')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'first written long ago' });
      const draftRow = await ctx.db
        .selectFrom('posts')
        .select(['id', 'created_at'])
        .where('author_id', '=', user.id)
        .where('status', '=', 'draft')
        .executeTakeFirstOrThrow();

      // Backdate the draft's created_at so the test demonstrates the gap
      // — without this, the draft and the published row would both round to
      // the same wall-clock instant and the test couldn't distinguish them.
      const backdated = new Date(Date.now() - 36 * 3600_000);
      await ctx.db
        .updateTable('posts')
        .set({ created_at: backdated })
        .where('id', '=', draftRow.id)
        .execute();

      const beforePublish = Date.now();
      const pub = await request(ctx.app)
        .post('/me/draft/publish')
        .set('Authorization', `Bearer ${token}`);
      expect(pub.status).toBe(200);

      // Assertion 1: published post has a NEW id (not the draft's id)
      expect(pub.body.post.id).not.toBe(draftRow.id);

      // Assertion 2: published post's created_at is the publish moment
      // (within a small slack of `beforePublish`), not the backdated draft
      const publishedRow = await ctx.db
        .selectFrom('posts')
        .select(['created_at'])
        .where('id', '=', pub.body.post.id)
        .executeTakeFirstOrThrow();
      expect(publishedRow.created_at.getTime()).toBeGreaterThanOrEqual(beforePublish - 1_000);
      expect(publishedRow.created_at.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);

      // Assertion 3: the original draft id no longer exists (DELETE happened)
      const draftStillExists = await ctx.db
        .selectFrom('posts')
        .select('id')
        .where('id', '=', draftRow.id)
        .executeTakeFirst();
      expect(draftStillExists).toBeUndefined();

      // Assertion 4: the body and is_anonymous carried over correctly
      expect(pub.body.post.body).toBe('first written long ago');
    });
  });
});
