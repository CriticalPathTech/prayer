import type { Database } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { commentCreatedBuilder } from '../../src/services/notification-builders/comment-created.js';
import { mintTestJwt } from '../helpers/jwt.js';
import { insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

async function insertNotification(
  ctx: TestApp,
  input: { userId: string; type?: string; readAt?: Date | null },
): Promise<{ id: string }> {
  const id = newId();
  await ctx.db
    .insertInto('notifications')
    .values({
      id,
      user_id: input.userId,
      type: input.type ?? 'comment.created',
      payload: { preview: 'hi' } as never,
      read_at: input.readAt ?? null,
    })
    .execute();
  return { id };
}

describe('GET /notifications', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.db.deleteFrom('notifications').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it("returns the caller's rows + unread_count envelope", async () => {
    const caller = await insertUser(ctx.db);
    const other = await insertUser(ctx.db);
    await insertNotification(ctx, { userId: caller.id });
    await insertNotification(ctx, { userId: caller.id, readAt: new Date() });
    await insertNotification(ctx, { userId: other.id });

    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const res = await request(ctx.app)
      .get('/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.unread_count).toBe(1);
  });

  it('unread=true filters and still returns total unread_count', async () => {
    const caller = await insertUser(ctx.db);
    await insertNotification(ctx, { userId: caller.id });
    await insertNotification(ctx, { userId: caller.id, readAt: new Date() });
    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const res = await request(ctx.app)
      .get('/notifications?unread=true')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.unread_count).toBe(1);
  });

  it('cursor pagination stays stable over 25 rows', async () => {
    const caller = await insertUser(ctx.db);
    for (let i = 0; i < 25; i++) await insertNotification(ctx, { userId: caller.id });
    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const a = await request(ctx.app)
      .get('/notifications?limit=10')
      .set('Authorization', `Bearer ${token}`);
    const b = await request(ctx.app)
      .get(`/notifications?limit=10&cursor=${a.body.next_cursor}`)
      .set('Authorization', `Bearer ${token}`);
    const c = await request(ctx.app)
      .get(`/notifications?limit=10&cursor=${b.body.next_cursor}`)
      .set('Authorization', `Bearer ${token}`);
    expect(a.body.items.length + b.body.items.length + c.body.items.length).toBe(25);
    expect(c.body.next_cursor).toBeNull();
  });
});

describe('POST /notifications/:id/read', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.db.deleteFrom('notifications').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('is idempotent — two calls both return 200', async () => {
    const caller = await insertUser(ctx.db);
    const n = await insertNotification(ctx, { userId: caller.id });
    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const a = await request(ctx.app)
      .post(`/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(a.status).toBe(200);
    const b = await request(ctx.app)
      .post(`/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(b.status).toBe(200);
    expect(b.body.read_at).toBe(a.body.read_at);
  });

  it('returns 404 when the id belongs to another user', async () => {
    const alice = await insertUser(ctx.db);
    const bob = await insertUser(ctx.db);
    const n = await insertNotification(ctx, { userId: alice.id });
    const token = await mintTestJwt({ sub: bob.supabaseAuthId, email: bob.email });
    const res = await request(ctx.app)
      .post(`/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /notifications/read-all', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.db.deleteFrom('notifications').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('flips all unread and returns the count', async () => {
    const caller = await insertUser(ctx.db);
    await insertNotification(ctx, { userId: caller.id });
    await insertNotification(ctx, { userId: caller.id });
    await insertNotification(ctx, { userId: caller.id, readAt: new Date() });
    const token = await mintTestJwt({ sub: caller.supabaseAuthId, email: caller.email });
    const res = await request(ctx.app)
      .post('/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
  });
});

describe('end-to-end: comment creates notification', () => {
  let db: Kysely<Database>;
  let ctx: TestApp;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('comments').execute();
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('users').execute();
  });

  it('non-author comment fires the builder and writes one notification row', async () => {
    // 1. Create two users
    const author = await insertUser(db);
    const commenter = await insertUser(db);

    // 2. Create a published post owned by author
    const post = await insertPost(db, { authorId: author.id, status: 'published' });

    // 3. Mint a JWT for commenter and POST the comment via supertest
    const token = await mintTestJwt({ sub: commenter.supabaseAuthId, email: commenter.email });
    const res = await request(ctx.app)
      .post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'praying for you' });
    expect(res.status).toBe(201);

    // 4. Look up the events row just created (type='comment.created')
    const event = await db
      .selectFrom('events')
      .select(['id', 'type', 'post_id', 'actor_id', 'payload'])
      .where('type', '=', 'comment.created')
      .executeTakeFirstOrThrow();

    // 5. Invoke the builder directly inside a transaction (worker is not running in NODE_ENV=test)
    await db.transaction().execute(async (trx) => {
      await commentCreatedBuilder(
        {
          id: event.id,
          type: event.type,
          post_id: event.post_id,
          actor_id: event.actor_id,
          payload: event.payload,
        },
        trx,
      );
    });

    // 6. Assert exactly one notification row exists for the post author
    const notifications = await db
      .selectFrom('notifications')
      .select(['user_id', 'type'])
      .execute();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.user_id).toBe(author.id);
    expect(notifications[0]!.type).toBe('comment.created');
  });
});
