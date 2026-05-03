import type { Database } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { mintTestJwt } from '../helpers/jwt.js';
import { insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp } from '../helpers/supertest.js';

describe('POST /mod/posts/:id/hide', () => {
  let db: Kysely<Database>;
  beforeAll(() => {
    db = initDb(process.env.TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('flags').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('users').execute();
  });

  it('moderator hides → 200 { hidden: true } + moderator.hide event', async () => {
    const author = await insertUser(db);
    const mod = await insertUser(db, { role: 'moderator' });
    const post = await insertPost(db, { authorId: author.id, status: 'published' });
    const ctx = await createTestApp();
    const token = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
    const res = await request(ctx.app)
      .post(`/mod/posts/${post.id}/hide`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.hidden).toBe(true);
    const row = await db
      .selectFrom('posts')
      .select('status')
      .where('id', '=', post.id)
      .executeTakeFirst();
    expect(row?.status).toBe('hidden');
    const ev = await db
      .selectFrom('events')
      .selectAll()
      .where('type', '=', 'moderator.hide')
      .execute();
    expect(ev).toHaveLength(1);
  });

  it('member → 403', async () => {
    const author = await insertUser(db);
    const mem = await insertUser(db);
    const post = await insertPost(db, { authorId: author.id, status: 'published' });
    const ctx = await createTestApp();
    const token = await mintTestJwt({ sub: mem.supabaseAuthId, email: mem.email });
    const res = await request(ctx.app)
      .post(`/mod/posts/${post.id}/hide`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

describe('POST /mod/posts/:id/dismiss-flags', () => {
  let db: Kysely<Database>;
  beforeAll(() => {
    db = initDb(process.env.TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('flags').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('users').execute();
  });

  it('dismisses flags and emits flag.resolved per row', async () => {
    const author = await insertUser(db);
    const mod = await insertUser(db, { role: 'moderator' });
    const flagger = await insertUser(db);
    const post = await insertPost(db, { authorId: author.id, status: 'published' });
    await db
      .insertInto('flags')
      .values({
        id: newId(),
        target_type: 'post',
        target_id: post.id,
        flagger_id: flagger.id,
        reason: 'off_topic',
      })
      .execute();
    const ctx = await createTestApp();
    const token = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
    const res = await request(ctx.app)
      .post(`/mod/posts/${post.id}/dismiss-flags`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.dismissed).toBe(1);
    const open = await db
      .selectFrom('flags')
      .select('id')
      .where('resolved_at', 'is', null)
      .execute();
    expect(open).toHaveLength(0);
    const evs = await db
      .selectFrom('events')
      .selectAll()
      .where('type', '=', 'flag.resolved')
      .execute();
    expect(evs).toHaveLength(1);
  });
});

describe('GET /mod/queue', () => {
  let db: Kysely<Database>;
  beforeAll(() => {
    db = initDb(process.env.TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('flags').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('users').execute();
  });

  it('returns deduped-per-target pending rows; 403 for non-mod', async () => {
    const author = await insertUser(db);
    const mod = await insertUser(db, { role: 'moderator' });
    const f1 = await insertUser(db);
    const f2 = await insertUser(db);
    const post = await insertPost(db, { authorId: author.id, status: 'published', body: 'hello' });
    await db
      .insertInto('flags')
      .values([
        {
          id: newId(),
          target_type: 'post',
          target_id: post.id,
          flagger_id: f1.id,
          reason: 'off_topic',
        },
        {
          id: newId(),
          target_type: 'post',
          target_id: post.id,
          flagger_id: f2.id,
          reason: 'hateful',
        },
      ])
      .execute();

    const ctx = await createTestApp();
    const modToken = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
    const resOk = await request(ctx.app)
      .get('/mod/queue?status=pending')
      .set('Authorization', `Bearer ${modToken}`);
    expect(resOk.status).toBe(200);
    expect(resOk.body.items).toHaveLength(1);
    expect(resOk.body.items[0].flag_count).toBe(2);

    const memToken = await mintTestJwt({ sub: f1.supabaseAuthId, email: f1.email });
    const resForbidden = await request(ctx.app)
      .get('/mod/queue')
      .set('Authorization', `Bearer ${memToken}`);
    expect(resForbidden.status).toBe(403);
  });
});
