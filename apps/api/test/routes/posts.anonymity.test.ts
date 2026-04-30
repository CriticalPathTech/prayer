import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { mintTestJwt } from '../helpers/jwt.js';
import { insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('anonymity masking', () => {
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

  it('member sees masked anonymous parent + update', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const member = await insertUser(ctx.db, { orgId });
    const parent = await insertPost(ctx.db, {
      authorId: author.id,
      orgId,
      status: 'published',
      isAnonymous: true,
    });
    await insertPost(ctx.db, {
      authorId: author.id,
      orgId,
      status: 'published',
      parentId: parent.id,
      isAnonymous: true,
    });
    const token = await mintTestJwt({ sub: member.supabaseAuthId, email: member.email });
    const res = await request(ctx.app)
      .get(`/posts/${parent.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.post.author_id).toBeNull();
    expect(res.body.post.display_name).toBeNull();
    expect(res.body.post.is_anonymous).toBe(true);
    expect(res.body.updates[0].author_id).toBeNull();
    expect(res.body.updates[0].display_name).toBeNull();
  });

  it('super_user sees real author on anonymous post + update', async () => {
    const author = await insertUser(ctx.db, { orgId });
    const admin = await insertUser(ctx.db, { orgId, role: 'super_user' });
    const parent = await insertPost(ctx.db, {
      authorId: author.id,
      orgId,
      status: 'published',
      isAnonymous: true,
    });
    await insertPost(ctx.db, {
      authorId: author.id,
      orgId,
      status: 'published',
      parentId: parent.id,
      isAnonymous: true,
    });
    const token = await mintTestJwt({ sub: admin.supabaseAuthId, email: admin.email });
    const res = await request(ctx.app)
      .get(`/posts/${parent.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.post.author_id).toBe(author.id);
    expect(res.body.updates[0].author_id).toBe(author.id);
  });
});
