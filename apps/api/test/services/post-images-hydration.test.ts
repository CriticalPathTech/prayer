import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { mintTestJwt } from '../helpers/jwt.js';
import { insertUser, makeJpeg } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('images appear in post-shaped responses', () => {
  let ctx: TestApp;
  let orgId: string;
  let memberToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    orgId = ctx.orgId;
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.db.deleteFrom('flags').execute();
    await ctx.db.deleteFrom('events').execute();
    await ctx.db.deleteFrom('post_images').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  async function authAsMember(): Promise<string> {
    const user = await insertUser(ctx.db, { orgId });
    return mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
  }

  async function publishWithImage(token: string): Promise<string> {
    const up = await request(ctx.app)
      .post('/me/images')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/octet-stream')
      .send(await makeJpeg(400, 300));

    await request(ctx.app)
      .put('/me/draft')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'pray for us', image_ids: [up.body.image.id] });

    const pub = await request(ctx.app)
      .post('/me/draft/publish')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    return pub.body.post.id as string;
  }

  it('feed carries images', async () => {
    memberToken = await authAsMember();
    await publishWithImage(memberToken);
    const res = await request(ctx.app)
      .get('/feed')
      .query({ filter: 'all' })
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    const post = res.body.posts[0];
    expect(post.images).toHaveLength(1);
    expect(post.images[0].thumb_url).toContain('_thumb');
    expect(post.images[0].purged).toBe(false);
  });

  it('post detail carries images', async () => {
    memberToken = await authAsMember();
    const id = await publishWithImage(memberToken);
    const res = await request(ctx.app)
      .get(`/posts/${id}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.body.post.images).toHaveLength(1);
  });

  it('a post without images gets an empty array', async () => {
    memberToken = await authAsMember();
    await request(ctx.app)
      .put('/me/draft')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ body: 'no photos here' });
    await request(ctx.app)
      .post('/me/draft/publish')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({});

    const res = await request(ctx.app)
      .get('/feed')
      .query({ filter: 'all' })
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.body.posts[0].images).toEqual([]);
  });

  it('the mod approvals queue carries images on pending posts', async () => {
    const authorToken = await authAsMember();
    const author = await insertUser(ctx.db, { orgId, email: `${Date.now()}author2@e.com` });
    const authorTokenB = await mintTestJwt({ sub: author.supabaseAuthId, email: author.email });
    void authorToken;

    const up = await request(ctx.app)
      .post('/me/images')
      .set('Authorization', `Bearer ${authorTokenB}`)
      .set('Content-Type', 'application/octet-stream')
      .send(await makeJpeg(200, 200));
    await request(ctx.app)
      .put('/me/draft')
      .set('Authorization', `Bearer ${authorTokenB}`)
      .send({ body: 'needs approval', image_ids: [up.body.image.id] });

    // Force approval requirement by hitting publish; requiresPostApproval is
    // read from org settings, which default to false in tests, so directly
    // mark it pending instead of relying on org config.
    const pub = await request(ctx.app)
      .post('/me/draft/publish')
      .set('Authorization', `Bearer ${authorTokenB}`)
      .send({});
    const postId = pub.body.post.id as string;
    await ctx.db.updateTable('posts').set({ status: 'pending' }).where('id', '=', postId).execute();

    const mod = await insertUser(ctx.db, {
      orgId,
      role: 'moderator',
      email: `${Date.now()}mod@e.com`,
    });
    const modToken = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });

    const res = await request(ctx.app)
      .get('/mod/approvals')
      .set('Authorization', `Bearer ${modToken}`);
    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { id: string }) => i.id === postId);
    expect(item.images).toHaveLength(1);
  });

  it('the mod queue carries images on flagged posts', async () => {
    const authorToken = await authAsMember();
    const up = await request(ctx.app)
      .post('/me/images')
      .set('Authorization', `Bearer ${authorToken}`)
      .set('Content-Type', 'application/octet-stream')
      .send(await makeJpeg(200, 200));
    await request(ctx.app)
      .put('/me/draft')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ body: 'flag me', image_ids: [up.body.image.id] });
    const pub = await request(ctx.app)
      .post('/me/draft/publish')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({});
    const postId = pub.body.post.id as string;

    const flagger = await insertUser(ctx.db, { orgId, email: `${Date.now()}flagger@e.com` });
    const flaggerToken = await mintTestJwt({ sub: flagger.supabaseAuthId, email: flagger.email });
    await request(ctx.app)
      .post(`/posts/${postId}/flags`)
      .set('Authorization', `Bearer ${flaggerToken}`)
      .send({ reason: 'inappropriate' });

    const mod = await insertUser(ctx.db, {
      orgId,
      role: 'moderator',
      email: `${Date.now()}mod2@e.com`,
    });
    const modToken = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });

    const res = await request(ctx.app).get('/mod/queue').set('Authorization', `Bearer ${modToken}`);
    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { target_id: string }) => i.target_id === postId);
    expect(item.images).toHaveLength(1);
  });

  it('the mod follow-up tab carries images on parent posts and their inline updates', async () => {
    const authorToken = await authAsMember();
    const postId = await publishWithImage(authorToken);

    // Updates don't currently support attaching their own photos (createUpdate
    // takes no imageIds), but the inline update dto must still carry the
    // images field shape (empty array, not undefined).
    await request(ctx.app)
      .post(`/posts/${postId}/updates`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ body: 'an update, no photo' });

    const mod = await insertUser(ctx.db, {
      orgId,
      role: 'moderator',
      email: `${Date.now()}mod3@e.com`,
    });
    const modToken = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });

    const res = await request(ctx.app)
      .get('/mod/follow-up')
      .set('Authorization', `Bearer ${modToken}`);
    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { id: string }) => i.id === postId);
    expect(item.images).toHaveLength(1);
    expect(item.updates).toHaveLength(1);
    expect(item.updates[0].images).toEqual([]);
  });

  it('the member profile page carries images on posts and their inline updates', async () => {
    const authorToken = await authAsMember();
    const postId = await publishWithImage(authorToken);

    await request(ctx.app)
      .post(`/posts/${postId}/updates`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ body: 'an update, no photo' });

    const me = await request(ctx.app).get('/me').set('Authorization', `Bearer ${authorToken}`);
    const userId = me.body.id as string;

    const res = await request(ctx.app)
      .get(`/users/${userId}/posts`)
      .set('Authorization', `Bearer ${authorToken}`);
    expect(res.status).toBe(200);
    const item = res.body.posts.find((p: { id: string }) => p.id === postId);
    expect(item.images).toHaveLength(1);
    expect(item.updates).toHaveLength(1);
    expect(item.updates[0].images).toEqual([]);
  });

  it('a follow-up post without photos gets an empty images array', async () => {
    memberToken = await authAsMember();
    await request(ctx.app)
      .put('/me/draft')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ body: 'no photos here either' });
    const pub = await request(ctx.app)
      .post('/me/draft/publish')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({});
    const postId = pub.body.post.id as string;

    const mod = await insertUser(ctx.db, {
      orgId,
      role: 'moderator',
      email: `${Date.now()}mod4@e.com`,
    });
    const modToken = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });

    const res = await request(ctx.app)
      .get('/mod/follow-up')
      .set('Authorization', `Bearer ${modToken}`);
    const item = res.body.items.find((i: { id: string }) => i.id === postId);
    expect(item.images).toEqual([]);
  });
});
