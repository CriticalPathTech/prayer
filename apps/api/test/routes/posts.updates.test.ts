import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { mintTestJwt } from '../helpers/jwt.js';
import { insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('POST /posts/:id/updates', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.db.deleteFrom('events').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('author creates an update', async () => {
    const user = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: user.id, status: 'published' });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/updates`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'progress!', is_answered_prayer: false });
    expect(res.status).toBe(201);
    expect(res.body.update.parent_id).toBe(post.id);
    const evts = await ctx.db.selectFrom('events').select('type').execute();
    expect(evts.map((e) => e.type)).toContain('post.update_created');
  });

  it('403 for non-author', async () => {
    const author = await insertUser(ctx.db);
    const other = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: author.id, status: 'published' });
    const token = await mintTestJwt({ sub: other.supabaseAuthId, email: other.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/updates`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'sneaky' });
    expect(res.status).toBe(403);
  });

  it('createUpdate with isAnsweredPrayer=true flips parent.is_answered_prayer to true', async () => {
    const user = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: user.id, status: 'published' });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/updates`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'God came through!', is_answered_prayer: true });
    expect(res.status).toBe(201);
    const parent = await ctx.db
      .selectFrom('posts')
      .select('is_answered_prayer')
      .where('id', '=', post.id)
      .executeTakeFirst();
    expect(parent?.is_answered_prayer).toBe(true);
  });

  it('inherits is_anonymous from parent regardless of payload', async () => {
    const user = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, {
      authorId: user.id,
      status: 'published',
      isAnonymous: true,
    });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/updates`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'update' });
    expect(res.status).toBe(201);
    const updateRow = await ctx.db
      .selectFrom('posts')
      .select('is_anonymous')
      .where('id', '=', res.body.update.id)
      .executeTakeFirst();
    expect(updateRow?.is_anonymous).toBe(true);
  });
});

describe('PATCH /posts/:id/updates/:uid', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.db.deleteFrom('events').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('edits update body within deadline', async () => {
    const user = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: user.id, status: 'published' });
    const update = await insertPost(ctx.db, {
      authorId: user.id,
      status: 'published',
      parentId: post.id,
    });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .patch(`/posts/${post.id}/updates/${update.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'edited', is_answered_prayer: true });
    expect(res.status).toBe(200);
    expect(res.body.update.body).toBe('edited');
    expect(res.body.update.is_answered_prayer).toBe(true);
  });

  it('editUpdate toggling isAnsweredPrayer=true propagates to parent', async () => {
    const user = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: user.id, status: 'published' });
    const update = await insertPost(ctx.db, {
      authorId: user.id,
      status: 'published',
      parentId: post.id,
    });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .patch(`/posts/${post.id}/updates/${update.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_answered_prayer: true });
    expect(res.status).toBe(200);
    expect(res.body.update.is_answered_prayer).toBe(true);
    const parent = await ctx.db
      .selectFrom('posts')
      .select('is_answered_prayer')
      .where('id', '=', post.id)
      .executeTakeFirst();
    expect(parent?.is_answered_prayer).toBe(true);
  });

  it('403 EDIT_DEADLINE_PASSED when deadline elapsed', async () => {
    const user = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: user.id, status: 'published' });
    const update = await insertPost(ctx.db, {
      authorId: user.id,
      status: 'published',
      parentId: post.id,
      editDeadline: new Date(Date.now() - 60_000),
    });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .patch(`/posts/${post.id}/updates/${update.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'too late' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EDIT_DEADLINE_PASSED');
  });
});
