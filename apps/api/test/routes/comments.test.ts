import { newId } from '@prayer/db';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { mintTestJwt } from '../helpers/jwt.js';
import { insertComment, insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('POST /posts/:postId/comments', () => {
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
    await ctx.db.deleteFrom('notifications').execute();
    await ctx.db.deleteFrom('events').execute();
    await ctx.db.deleteFrom('comments').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('401 without a token', async () => {
    const res = await request(ctx.app).post('/posts/abc/comments').send({ body: 'hi' });
    expect(res.status).toBe(401);
  });

  it('creates a comment as a non-author', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const commenter = await insertUser(ctx.db, { orgId });
    const post = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    const token = await mintTestJwt({ sub: commenter.supabaseAuthId, email: commenter.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Praying for you' });
    expect(res.status).toBe(201);
    expect(res.body.comment.participant_id).toBe(commenter.id);
  });

  it('404 on archived post', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const commenter = await insertUser(ctx.db, { orgId });
    const post = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'archived' });
    const token = await mintTestJwt({ sub: commenter.supabaseAuthId, email: commenter.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'hi' });
    expect(res.status).toBe(404);
  });

  it('400 when post author omits participant_id', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const commenter = await insertUser(ctx.db, { orgId });
    const post = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    await insertComment(ctx.db, { postId: post.id, authorId: commenter.id, orgId });
    const token = await mintTestJwt({ sub: author.supabaseAuthId, email: author.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'reply' });
    expect(res.status).toBe(400);
  });
});

describe('GET /posts/:postId/comments', () => {
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
    await ctx.db.deleteFrom('comments').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('non-participant gets empty threads', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const a = await insertUser(ctx.db, { orgId });
    const outsider = await insertUser(ctx.db, { orgId });
    const post = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    await insertComment(ctx.db, { postId: post.id, authorId: a.id, orgId });
    const token = await mintTestJwt({ sub: outsider.supabaseAuthId, email: outsider.email });
    const res = await request(ctx.app)
      .get(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.threads).toEqual([]);
  });

  it('moderator sees all threads', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const a = await insertUser(ctx.db, { orgId });
    const b = await insertUser(ctx.db, { orgId });
    const mod = await insertUser(ctx.db, { orgId, role: 'moderator' });
    const post = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    await insertComment(ctx.db, { postId: post.id, authorId: a.id, orgId });
    await insertComment(ctx.db, { postId: post.id, authorId: b.id, orgId });
    const token = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
    const res = await request(ctx.app)
      .get(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.threads).toHaveLength(2);
  });
});

describe('PATCH /posts/:postId/comments/:id', () => {
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
    await ctx.db.deleteFrom('comments').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('author edits own comment within 1h', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const commenter = await insertUser(ctx.db, { orgId });
    const post = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    const c = await insertComment(ctx.db, { postId: post.id, authorId: commenter.id, orgId });
    const token = await mintTestJwt({ sub: commenter.supabaseAuthId, email: commenter.email });
    const res = await request(ctx.app)
      .patch(`/posts/${post.id}/comments/${c.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'edited' });
    expect(res.status).toBe(200);
    expect(res.body.comment.body).toBe('edited');
  });

  it('403 for non-author', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const commenter = await insertUser(ctx.db, { orgId });
    const outsider = await insertUser(ctx.db, { orgId });
    const post = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    const c = await insertComment(ctx.db, { postId: post.id, authorId: commenter.id, orgId });
    const token = await mintTestJwt({ sub: outsider.supabaseAuthId, email: outsider.email });
    const res = await request(ctx.app)
      .patch(`/posts/${post.id}/comments/${c.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'hijacked' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /posts/:postId/comments/:id', () => {
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
    await ctx.db.deleteFrom('comments').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('author hides own', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const commenter = await insertUser(ctx.db, { orgId });
    const post = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    const c = await insertComment(ctx.db, { postId: post.id, authorId: commenter.id, orgId });
    const token = await mintTestJwt({ sub: commenter.supabaseAuthId, email: commenter.email });
    const res = await request(ctx.app)
      .delete(`/posts/${post.id}/comments/${c.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('moderator hides any', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const commenter = await insertUser(ctx.db, { orgId });
    const mod = await insertUser(ctx.db, { orgId, role: 'moderator' });
    const post = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    const c = await insertComment(ctx.db, { postId: post.id, authorId: commenter.id, orgId });
    const token = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
    const res = await request(ctx.app)
      .delete(`/posts/${post.id}/comments/${c.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});

describe('GET /posts/:id/comments — M5 reaction hydration', () => {
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
    await ctx.db.deleteFrom('reactions').execute();
    await ctx.db.deleteFrom('comments').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('returns per-comment reaction summary with mine flag', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const participant = await insertUser(ctx.db, { orgId });
    const post = await insertPost(ctx.db, { authorId: author.id, orgId, status: 'published' });
    const comment = await insertComment(ctx.db, {
      postId: post.id,
      authorId: participant.id,
      orgId,
      participantId: participant.id,
    });
    await ctx.db
      .insertInto('reactions')
      .values([
        {
          id: newId(),
          org_id: orgId,
          target_type: 'comment',
          target_id: comment.id,
          author_id: author.id,
          emoji: '✝️',
        },
        {
          id: newId(),
          org_id: orgId,
          target_type: 'comment',
          target_id: comment.id,
          author_id: participant.id,
          emoji: '✝️',
        },
      ])
      .execute();

    const token = await mintTestJwt({ sub: author.supabaseAuthId, email: author.email });
    const res = await request(ctx.app)
      .get(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const c = res.body.threads[0].comments[0];
    expect(c.reactions).toMatchObject({ '✝️': { count: 2, mine: true } });
  });
});
