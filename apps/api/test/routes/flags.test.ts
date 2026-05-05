import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { mintTestJwt } from '../helpers/jwt.js';
import { getHopeChurchOrgId, insertComment, insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp } from '../helpers/supertest.js';

describe('POST /posts/:id/flags', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await getHopeChurchOrgId(db);
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('flags').execute();
    await db.deleteFrom('comments').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('creates a flag and returns { flag_count }', async () => {
    const author = await insertUser(db, { orgId });
    const flagger = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const ctx = await createTestApp();
    const token = await mintTestJwt({ sub: flagger.supabaseAuthId, email: flagger.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/flags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'off_topic' });
    expect(res.status).toBe(200);
    expect(res.body.flag_count).toBe(0);
    const flags = await db.selectFrom('flags').selectAll().execute();
    expect(flags).toHaveLength(1);
  });

  it('400 on SELF_FLAG', async () => {
    const author = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const ctx = await createTestApp();
    const token = await mintTestJwt({ sub: author.supabaseAuthId, email: author.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/flags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'inappropriate' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_FLAG');
  });

  it('409 on double-flag', async () => {
    const author = await insertUser(db, { orgId });
    const flagger = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const ctx = await createTestApp();
    const token = await mintTestJwt({ sub: flagger.supabaseAuthId, email: flagger.email });
    await request(ctx.app)
      .post(`/posts/${post.id}/flags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'off_topic' });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/flags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'off_topic' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_FLAGGED');
  });

  it('400 when reason="other" missing note', async () => {
    const author = await insertUser(db, { orgId });
    const flagger = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const ctx = await createTestApp();
    const token = await mintTestJwt({ sub: flagger.supabaseAuthId, email: flagger.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/flags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'other' });
    expect(res.status).toBe(400);
  });

  it('404 on comment with mismatched postId', async () => {
    const author = await insertUser(db, { orgId });
    const flagger = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const otherPost = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const comment = await insertComment(db, {
      postId: post.id,
      authorId: author.id,
      orgId,
      participantId: author.id,
    });
    const ctx = await createTestApp();
    const token = await mintTestJwt({ sub: flagger.supabaseAuthId, email: flagger.email });
    const res = await request(ctx.app)
      .post(`/posts/${otherPost.id}/comments/${comment.id}/flags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'inappropriate' });
    expect(res.status).toBe(404);
  });
});
