import { newId } from '@prayer/db';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { mintTestJwt } from '../helpers/jwt.js';
import { insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('POST /posts', () => {
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

  it('401 without a token', async () => {
    const res = await request(ctx.app).post('/posts').send({ body: 'hi' });
    expect(res.status).toBe(401);
  });

  it('creates a draft with defaults', async () => {
    const user = await insertUser(ctx.db);
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Please pray for me.' });
    expect(res.status).toBe(201);
    expect(res.body.post).toMatchObject({
      body: 'Please pray for me.',
      status: 'draft',
      is_anonymous: false,
      is_answered_prayer: false,
    });
    expect(res.body.post.edit_deadline).toBeDefined();
    expect(res.body.post.expires_at).toBeDefined();
    const evts = await ctx.db.selectFrom('events').selectAll().execute();
    expect(evts).toHaveLength(0);
  });

  it('rejects empty body', async () => {
    const user = await insertUser(ctx.db);
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: '' });
    expect(res.status).toBe(400);
  });

  it('rejects body > 10KB', async () => {
    const user = await insertUser(ctx.db);
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'x'.repeat(10_001) });
    expect(res.status).toBe(400);
  });

  it('rejects expires_at < now+1d', async () => {
    const user = await insertUser(ctx.db);
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'hi', expires_at: new Date(Date.now() + 1000).toISOString() });
    expect(res.status).toBe(400);
  });
});

describe('POST /posts/:id/publish', () => {
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

  it("publishes author's draft", async () => {
    const user = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: user.id, status: 'draft' });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.post.status).toBe('published');
  });

  it('403 for non-author', async () => {
    const author = await insertUser(ctx.db);
    const other = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: author.id, status: 'draft' });
    const token = await mintTestJwt({ sub: other.supabaseAuthId, email: other.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('404 for unknown post', async () => {
    const user = await insertUser(ctx.db);
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .post(`/posts/018f0000-0000-7000-8000-0000000000ff/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /posts/:id', () => {
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

  it('returns the post + updates array', async () => {
    const user = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: user.id, status: 'published' });
    const update = await insertPost(ctx.db, {
      authorId: user.id,
      parentId: post.id,
      status: 'published',
    });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .get(`/posts/${post.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.post.id).toBe(post.id);
    expect(res.body.updates).toHaveLength(1);
    expect(res.body.updates[0].id).toBe(update.id);
  });

  it('404 for archived post when caller is not the author', async () => {
    const author = await insertUser(ctx.db);
    const other = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: author.id, status: 'archived' });
    const token = await mintTestJwt({ sub: other.supabaseAuthId, email: other.email });
    const res = await request(ctx.app)
      .get(`/posts/${post.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('author sees their own archived post', async () => {
    const author = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: author.id, status: 'archived' });
    const token = await mintTestJwt({ sub: author.supabaseAuthId, email: author.email });
    const res = await request(ctx.app)
      .get(`/posts/${post.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /posts/:id', () => {
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

  it('edits body within edit_deadline', async () => {
    const user = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: user.id, status: 'published' });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .patch(`/posts/${post.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'updated' });
    expect(res.status).toBe(200);
    expect(res.body.post.body).toBe('updated');
  });

  it('rejects with 403 edit_deadline_passed when deadline elapsed', async () => {
    const user = await insertUser(ctx.db);
    const past = new Date(Date.now() - 60_000);
    const post = await insertPost(ctx.db, {
      authorId: user.id,
      status: 'published',
      editDeadline: past,
    });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .patch(`/posts/${post.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'too late' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EDIT_DEADLINE_PASSED');
  });

  it('403 for non-author', async () => {
    const author = await insertUser(ctx.db);
    const other = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: author.id, status: 'published' });
    const token = await mintTestJwt({ sub: other.supabaseAuthId, email: other.email });
    const res = await request(ctx.app)
      .patch(`/posts/${post.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'hacked' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /posts/:id', () => {
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

  it("archives author's post", async () => {
    const user = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: user.id, status: 'published' });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .delete(`/posts/${post.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    const row = await ctx.db
      .selectFrom('posts')
      .select('status')
      .where('id', '=', post.id)
      .executeTakeFirst();
    expect(row?.status).toBe('archived');
  });

  it('403 for non-author', async () => {
    const author = await insertUser(ctx.db);
    const other = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: author.id, status: 'published' });
    const token = await mintTestJwt({ sub: other.supabaseAuthId, email: other.email });
    const res = await request(ctx.app)
      .delete(`/posts/${post.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /posts/me/archive', () => {
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

  it("returns only caller's archived posts", async () => {
    const me = await insertUser(ctx.db);
    await insertPost(ctx.db, { authorId: me.id, status: 'archived' });
    await insertPost(ctx.db, { authorId: me.id, status: 'published' });
    const token = await mintTestJwt({ sub: me.supabaseAuthId, email: me.email });
    const res = await request(ctx.app)
      .get('/posts/me/archive')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].status).toBe('archived');
  });
});

describe('GET /posts/:id — M5 reactions + prayer hydration', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.db.deleteFrom('events').execute();
    await ctx.db.deleteFrom('reactions').execute();
    await ctx.db.deleteFrom('prayers').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('returns reactions + prayer summaries with mine flag for the caller', async () => {
    const author = await insertUser(ctx.db);
    const caller = await insertUser(ctx.db);
    const other = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: author.id, status: 'published' });
    await ctx.db
      .insertInto('reactions')
      .values([
        { id: newId(), target_type: 'post', target_id: post.id, author_id: caller.id, emoji: '🙏' },
        { id: newId(), target_type: 'post', target_id: post.id, author_id: other.id, emoji: '🙏' },
        { id: newId(), target_type: 'post', target_id: post.id, author_id: other.id, emoji: '❤️' },
      ])
      .execute();
    await ctx.db
      .insertInto('prayers')
      .values({ id: newId(), post_id: post.id, user_id: caller.id })
      .execute();

    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const res = await request(ctx.app)
      .get(`/posts/${post.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.reactions).toMatchObject({
      '🙏': { count: 2, mine: true },
      '❤️': { count: 1, mine: false },
    });
    expect(res.body.prayer).toMatchObject({ prayer_count: 1, prayed: true });
  });
});
