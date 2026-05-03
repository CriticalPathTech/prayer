import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { mintTestJwt } from '../helpers/jwt.js';
import { insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('POST /posts/:postId/pray', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.db.deleteFrom('events').execute();
    await ctx.db.deleteFrom('prayers').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('toggles { prayed, prayer_count }', async () => {
    const author = await insertUser(ctx.db);
    const pray = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: author.id, status: 'published' });
    const token = await mintTestJwt({ sub: pray.supabaseAuthId, email: pray.email });
    const r1 = await request(ctx.app)
      .post(`/posts/${post.id}/pray`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(r1.status).toBe(200);
    expect(r1.body.prayed).toBe(true);
    const r2 = await request(ctx.app)
      .post(`/posts/${post.id}/pray`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(r2.body.prayed).toBe(false);
  });

  it('404 on draft post (non-author caller)', async () => {
    const author = await insertUser(ctx.db);
    const other = await insertUser(ctx.db);
    const post = await insertPost(ctx.db, { authorId: author.id, status: 'draft' });
    const token = await mintTestJwt({ sub: other.supabaseAuthId, email: other.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/pray`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(404);
  });
});
