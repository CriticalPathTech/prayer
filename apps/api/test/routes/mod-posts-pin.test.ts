import type { Database } from '@prayer/db';
import type { Express } from 'express';
import type { Kysely } from 'kysely';
import request from 'supertest';
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { mintTestJwt } from '../helpers/jwt.js';
import { getTestchurchOrgId, insertOrg, insertUser, insertPost } from '../helpers/seed.js';
import { createTestApp } from '../helpers/supertest.js';

describe('POST /mod/posts/:id/pin', () => {
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
    // Clean up posts for test users (including cross-org posts) before removing users
    const testUsers = await db
      .selectFrom('users')
      .select('id')
      .where('email', 'like', '%@pin-test.local')
      .execute();
    const testUserIds = testUsers.map((u) => u.id);
    if (testUserIds.length > 0) {
      await db.deleteFrom('events').where('actor_id', 'in', testUserIds).execute();
      await db.deleteFrom('posts').where('author_id', 'in', testUserIds).execute();
    }
    await db.deleteFrom('posts').where('org_id', '=', orgId).execute();
    await db.deleteFrom('user_orgs').where('org_id', '=', orgId).execute();
    // Clean up orgs created during cross-org tests (other than testchurch)
    await db.deleteFrom('orgs').where('slug', 'like', 'other-%').execute();
    await db.deleteFrom('users').where('email', 'like', '%@pin-test.local').execute();
  });

  async function makeMod() {
    const u = await insertUser(db, {
      orgId,
      role: 'moderator',
      email: `mod-${Date.now()}@pin-test.local`,
    });
    return { ...u, token: await mintTestJwt({ sub: u.supabaseAuthId, email: u.email }) };
  }
  async function makeMember() {
    const u = await insertUser(db, {
      orgId,
      role: 'member',
      email: `mem-${Date.now()}@pin-test.local`,
    });
    return { ...u, token: await mintTestJwt({ sub: u.supabaseAuthId, email: u.email }) };
  }

  it('mod pins a published post → 200, columns set', async () => {
    const mod = await makeMod();
    const author = await makeMember();
    const { id } = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const res = await request(app)
      .post(`/mod/posts/${id}/pin`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({ duration_days: 7 });
    expect(res.status).toBe(200);
    const row = await db
      .selectFrom('posts')
      .select(['pinned_at', 'pin_until', 'pinned_by'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.pinned_at).not.toBeNull();
    expect(row.pin_until).not.toBeNull();
    expect(row.pinned_by).toBe(mod.id);
  });

  it('pin draft → 409 not_published', async () => {
    const mod = await makeMod();
    const author = await makeMember();
    const { id } = await insertPost(db, { authorId: author.id, orgId, status: 'draft' });
    const res = await request(app)
      .post(`/mod/posts/${id}/pin`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({ duration_days: 7 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_published');
  });

  it('pin already-pinned → 409 already_pinned', async () => {
    const mod = await makeMod();
    const author = await makeMember();
    const { id } = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      pinned: { byUserId: mod.id, durationDays: 7 },
    });
    const res = await request(app)
      .post(`/mod/posts/${id}/pin`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({ duration_days: 7 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_pinned');
  });

  it('member calling pin → 403', async () => {
    const member = await makeMember();
    const author = await makeMember();
    const { id } = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const res = await request(app)
      .post(`/mod/posts/${id}/pin`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ duration_days: 7 });
    expect(res.status).toBe(403);
  });

  it('cross-org pin → 404', async () => {
    const mod = await makeMod();
    const otherOrgId = await insertOrg(db, { slug: `other-${Date.now()}` });
    const otherAuthor = await insertUser(db, {
      orgId: otherOrgId,
      role: 'member',
      email: `o-${Date.now()}@pin-test.local`,
    });
    const { id } = await insertPost(db, {
      authorId: otherAuthor.id,
      orgId: otherOrgId,
      status: 'published',
    });
    const res = await request(app)
      .post(`/mod/posts/${id}/pin`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({ duration_days: 7 });
    expect(res.status).toBe(404);
  });

  it('invalid duration → 400', async () => {
    const mod = await makeMod();
    const author = await makeMember();
    const { id } = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const res = await request(app)
      .post(`/mod/posts/${id}/pin`)
      .set('Authorization', `Bearer ${mod.token}`)
      .send({ duration_days: 5 });
    expect(res.status).toBe(400);
  });
});

describe('POST /mod/posts/:id/unpin', () => {
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
    await db.deleteFrom('posts').where('org_id', '=', orgId).execute();
    await db.deleteFrom('user_orgs').where('org_id', '=', orgId).execute();
    await db.deleteFrom('users').where('email', 'like', '%@unpin-test.local').execute();
  });

  async function makeMod() {
    const u = await insertUser(db, {
      orgId,
      role: 'moderator',
      email: `mod-${Date.now()}@unpin-test.local`,
    });
    return { ...u, token: await mintTestJwt({ sub: u.supabaseAuthId, email: u.email }) };
  }

  it('unpinning a pinned post → 200, columns cleared', async () => {
    const mod = await makeMod();
    const { id } = await insertPost(db, {
      authorId: mod.id,
      orgId,
      status: 'published',
      pinned: { byUserId: mod.id, durationDays: 7 },
    });
    const res = await request(app)
      .post(`/mod/posts/${id}/unpin`)
      .set('Authorization', `Bearer ${mod.token}`);
    expect(res.status).toBe(200);
    const row = await db
      .selectFrom('posts')
      .select(['pinned_at', 'pin_until', 'pinned_by'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.pinned_at).toBeNull();
    expect(row.pin_until).toBeNull();
    expect(row.pinned_by).toBeNull();
  });

  it('unpinning an already-unpinned post → 200 no-op', async () => {
    const mod = await makeMod();
    const { id } = await insertPost(db, { authorId: mod.id, orgId, status: 'published' });
    const res = await request(app)
      .post(`/mod/posts/${id}/unpin`)
      .set('Authorization', `Bearer ${mod.token}`);
    expect(res.status).toBe(200);
  });
});
