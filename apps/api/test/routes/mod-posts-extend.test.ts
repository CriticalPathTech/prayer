import type { Database } from '@prayer/db';
import type { Express } from 'express';
import type { Kysely } from 'kysely';
import request from 'supertest';
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { mintTestJwt } from '../helpers/jwt.js';
import { getTestchurchOrgId, insertOrg, insertUser, insertPost } from '../helpers/seed.js';
import { createTestApp } from '../helpers/supertest.js';

const DAY_MS = 86_400_000;

describe('POST /mod/posts/:id/extend', () => {
  let app: Express;
  let db: Kysely<Database>;
  let orgId: string;

  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    const ctx = await createTestApp();
    app = ctx.app;
    orgId = await getTestchurchOrgId(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  afterEach(async () => {
    const testUsers = await db
      .selectFrom('users')
      .select('id')
      .where('email', 'like', '%@extend-test.local')
      .execute();
    const testUserIds = testUsers.map((u) => u.id);
    if (testUserIds.length > 0) {
      await db.deleteFrom('events').where('actor_id', 'in', testUserIds).execute();
      await db.deleteFrom('posts').where('author_id', 'in', testUserIds).execute();
    }
    await db.deleteFrom('events').where('org_id', '=', orgId).execute();
    await db.deleteFrom('posts').where('org_id', '=', orgId).execute();
    await db.deleteFrom('user_orgs').where('org_id', '=', orgId).execute();
    await db.deleteFrom('orgs').where('slug', 'like', 'other-%').execute();
    await db.deleteFrom('users').where('email', 'like', '%@extend-test.local').execute();
  });

  async function makeMod() {
    const u = await insertUser(db, {
      orgId,
      role: 'moderator',
      email: `mod-${Date.now()}-${Math.round(performance.now())}@extend-test.local`,
    });
    return { ...u, token: await mintTestJwt({ sub: u.supabaseAuthId, email: u.email }) };
  }
  async function makeMember() {
    const u = await insertUser(db, {
      orgId,
      role: 'member',
      email: `mem-${Date.now()}-${Math.round(performance.now())}@extend-test.local`,
    });
    return { ...u, token: await mintTestJwt({ sub: u.supabaseAuthId, email: u.email }) };
  }

  it('mod extends a published post → 200, expires_at = now+N, audit columns set, event written', async () => {
    const mod = await makeMod();
    const author = await makeMember();
    const { id } = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      expiresAt: new Date(Date.now() + 2 * DAY_MS),
    });
    const res = await request(app)
      .post(`/mod/posts/${id}/extend`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({ duration_days: 14 });

    expect(res.status).toBe(200);
    expect(res.body.post.extended_at).not.toBeNull();
    // Mod is privileged → named attribution projected.
    expect(res.body.post.extended_by?.id).toBe(mod.id);

    const row = await db
      .selectFrom('posts')
      .select(['status', 'expires_at', 'extended_at', 'extended_by'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('published');
    expect(row.extended_by).toBe(mod.id);
    expect(row.extended_at).not.toBeNull();
    const expectedExpiry = Date.now() + 14 * DAY_MS;
    expect(Math.abs(row.expires_at!.getTime() - expectedExpiry)).toBeLessThan(60_000);

    const events = await db
      .selectFrom('events')
      .select(['type', 'post_id', 'actor_id'])
      .where('post_id', '=', id)
      .where('type', '=', 'post.extended')
      .execute();
    expect(events.length).toBe(1);
    expect(events[0]!.actor_id).toBe(mod.id);
  });

  it('mod extends an archived post → 200, un-archives it (status → published) with future expiry', async () => {
    const mod = await makeMod();
    const author = await makeMember();
    const { id } = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'archived',
      expiresAt: new Date(Date.now() - DAY_MS), // already past
    });
    const res = await request(app)
      .post(`/mod/posts/${id}/extend`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({ duration_days: 7 });

    expect(res.status).toBe(200);
    expect(res.body.post.status).toBe('published');

    const row = await db
      .selectFrom('posts')
      .select(['status', 'expires_at'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('published');
    expect(row.expires_at!.getTime()).toBeGreaterThan(Date.now());
  });

  it('extend a draft → 409 not_extendable', async () => {
    const mod = await makeMod();
    const author = await makeMember();
    const { id } = await insertPost(db, { authorId: author.id, orgId, status: 'draft' });
    const res = await request(app)
      .post(`/mod/posts/${id}/extend`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({ duration_days: 7 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_extendable');
  });

  it('extend a hidden post → 409 not_extendable', async () => {
    const mod = await makeMod();
    const author = await makeMember();
    const { id } = await insertPost(db, { authorId: author.id, orgId, status: 'hidden' });
    const res = await request(app)
      .post(`/mod/posts/${id}/extend`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({ duration_days: 7 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_extendable');
  });

  it('extend a child update → 409 not_extendable', async () => {
    const mod = await makeMod();
    const author = await makeMember();
    const parent = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const child = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      parentId: parent.id,
    });
    const res = await request(app)
      .post(`/mod/posts/${child.id}/extend`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({ duration_days: 7 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_extendable');
  });

  it('member calling extend → 403', async () => {
    const member = await makeMember();
    const author = await makeMember();
    const { id } = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const res = await request(app)
      .post(`/mod/posts/${id}/extend`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ duration_days: 7 });
    expect(res.status).toBe(403);
  });

  it('cross-org extend → 404', async () => {
    const mod = await makeMod();
    const otherOrgId = await insertOrg(db, { slug: `other-${Date.now()}` });
    const otherAuthor = await insertUser(db, {
      orgId: otherOrgId,
      role: 'member',
      email: `o-${Date.now()}@extend-test.local`,
    });
    const { id } = await insertPost(db, {
      authorId: otherAuthor.id,
      orgId: otherOrgId,
      status: 'published',
    });
    const res = await request(app)
      .post(`/mod/posts/${id}/extend`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({ duration_days: 7 });
    expect(res.status).toBe(404);
  });

  it('invalid duration → 400', async () => {
    const mod = await makeMod();
    const author = await makeMember();
    const { id } = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const res = await request(app)
      .post(`/mod/posts/${id}/extend`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({ duration_days: 5 });
    expect(res.status).toBe(400);
  });
});
