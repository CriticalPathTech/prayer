import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { mintTestJwt } from '../helpers/jwt.js';
import { insertUser, makeJpeg } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('POST /me/images', () => {
  let ctx: TestApp;
  let memberToken: string;
  let otherMemberToken: string;

  beforeEach(async () => {
    ctx = await createTestApp();
    const member = await insertUser(ctx.db, {
      orgId: ctx.orgId,
      email: 'member@example.com',
      displayName: 'Member',
    });
    const otherMember = await insertUser(ctx.db, {
      orgId: ctx.orgId,
      email: 'other@example.com',
      displayName: 'Other',
    });
    memberToken = `Bearer ${await mintTestJwt({ sub: member.supabaseAuthId, email: member.email })}`;
    otherMemberToken = `Bearer ${await mintTestJwt({ sub: otherMember.supabaseAuthId, email: otherMember.email })}`;
  });

  afterEach(async () => {
    await ctx.db.deleteFrom('post_images').execute();
    await ctx.db.deleteFrom('events').execute();
    await ctx.db.deleteFrom('posts').execute();
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
    await ctx.close();
  });

  it('accepts a raw image body and returns the dto', async () => {
    const res = await request(ctx.app)
      .post('/me/images')
      .set('Authorization', memberToken)
      .set('Content-Type', 'application/octet-stream')
      .send(await makeJpeg(800, 600));

    expect(res.status).toBe(200);
    expect(res.body.image.width).toBe(800);
    expect(res.body.image.thumb_url).toContain('_thumb');
  });

  it('rejects an unauthenticated caller', async () => {
    const res = await request(ctx.app)
      .post('/me/images')
      .set('Content-Type', 'application/octet-stream')
      .send(await makeJpeg(10, 10));
    expect(res.status).toBe(401);
  });

  it('rejects a renamed non-image', async () => {
    const res = await request(ctx.app)
      .post('/me/images')
      .set('Authorization', memberToken)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('this is definitely not a jpeg'));
    expect(res.status).toBe(400);
  });

  it('rejects a fourth image', async () => {
    for (let i = 0; i < 3; i += 1) {
      await request(ctx.app)
        .post('/me/images')
        .set('Authorization', memberToken)
        .set('Content-Type', 'application/octet-stream')
        .send(await makeJpeg(50, 50));
    }
    const res = await request(ctx.app)
      .post('/me/images')
      .set('Authorization', memberToken)
      .set('Content-Type', 'application/octet-stream')
      .send(await makeJpeg(50, 50));
    expect(res.status).toBe(400);
  });

  it('deletes an own unattached image', async () => {
    const created = await request(ctx.app)
      .post('/me/images')
      .set('Authorization', memberToken)
      .set('Content-Type', 'application/octet-stream')
      .send(await makeJpeg(50, 50));

    const res = await request(ctx.app)
      .delete(`/me/images/${created.body.image.id}`)
      .set('Authorization', memberToken);
    expect(res.status).toBe(204);
  });

  it('refuses to delete another member’s image', async () => {
    const created = await request(ctx.app)
      .post('/me/images')
      .set('Authorization', memberToken)
      .set('Content-Type', 'application/octet-stream')
      .send(await makeJpeg(50, 50));

    const res = await request(ctx.app)
      .delete(`/me/images/${created.body.image.id}`)
      .set('Authorization', otherMemberToken);
    expect(res.status).toBe(403);
  });
});
