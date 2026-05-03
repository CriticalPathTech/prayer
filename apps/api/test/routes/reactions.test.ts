import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { mintTestJwt } from '../helpers/jwt.js';
import { insertComment, insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('POST /posts/:postId/reactions', () => {
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
    await ctx.db.deleteFrom('comments').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('toggles on then off and returns { reacted, reaction_count }', async () => {
    const author = await insertUser(ctx.db);
    const reactor = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: author.id, status: 'published' });
    const token = await mintTestJwt({ sub: reactor.supabaseAuthId, email: reactor.email });

    const r1 = await request(ctx.app)
      .post(`/posts/${post.id}/reactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ emoji: '🙏' });
    expect(r1.status).toBe(200);
    expect(r1.body.reacted).toBe(true);

    const r2 = await request(ctx.app)
      .post(`/posts/${post.id}/reactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ emoji: '🙏' });
    expect(r2.body.reacted).toBe(false);
  });

  it('400s on bad emoji', async () => {
    const author = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: author.id, status: 'published' });
    const token = await mintTestJwt({ sub: author.supabaseAuthId, email: author.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/reactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ emoji: '🚀' });
    expect(res.status).toBe(400);
  });

  it('403 on comment reaction from non-participant', async () => {
    const postAuthor = await insertUser(ctx.db);
    const participant = await insertUser(ctx.db);
    const stranger = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: postAuthor.id, status: 'published' });
    const comment = await insertComment(ctx.db, {
      postId: post.id,
      authorId: participant.id,
      participantId: participant.id,
    });
    const token = await mintTestJwt({ sub: stranger.supabaseAuthId, email: stranger.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/comments/${comment.id}/reactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ emoji: '🙏' });
    expect(res.status).toBe(403);
  });
});
