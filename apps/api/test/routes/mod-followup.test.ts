import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { mintTestJwt } from '../helpers/jwt.js';
import { insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp } from '../helpers/supertest.js';

const cleanupDb = initDb(process.env.TEST_DATABASE_URL!);
afterEach(async () => {
  // Each test in this file inserts posts directly; without per-test cleanup,
  // the cursor-pagination test sees posts inserted by earlier tests and the
  // length assertion fails. We isolate at the posts/users level so the
  // testchurch org row (seeded by global-setup) survives across tests.
  await cleanupDb.deleteFrom('comments').execute();
  await cleanupDb.deleteFrom('posts').execute();
  await cleanupDb.deleteFrom('user_orgs').execute();
  await cleanupDb.deleteFrom('users').execute();
});
afterAll(async () => {
  await cleanupDb.destroy();
});

describe('GET /mod/follow-up', () => {
  it('200 for moderator', async () => {
    const { agent, db, orgId, close } = await createTestApp();
    try {
      const mod = await insertUser(db, { orgId, role: 'moderator' });
      await insertPost(db, { authorId: mod.id, orgId, status: 'published' });
      const token = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
      const res = await agent.get('/mod/follow-up').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ items: expect.any(Array), next_cursor: null });
    } finally {
      await close();
    }
  });

  it('200 for super_user', async () => {
    const { agent, db, orgId, close } = await createTestApp();
    try {
      const su = await insertUser(db, { orgId, role: 'super_user' });
      const token = await mintTestJwt({ sub: su.supabaseAuthId, email: su.email });
      const res = await agent.get('/mod/follow-up').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    } finally {
      await close();
    }
  });

  it('403 for member', async () => {
    const { agent, db, orgId, close } = await createTestApp();
    try {
      const m = await insertUser(db, { orgId, role: 'member' });
      const token = await mintTestJwt({ sub: m.supabaseAuthId, email: m.email });
      const res = await agent.get('/mod/follow-up').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    } finally {
      await close();
    }
  });

  it('400 when min_age_value exceeds 8760', async () => {
    const { agent, db, orgId, close } = await createTestApp();
    try {
      const mod = await insertUser(db, { orgId, role: 'moderator' });
      const token = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
      const res = await agent
        .get('/mod/follow-up?min_age_value=9000')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    } finally {
      await close();
    }
  });

  it('400 when min_age_unit is invalid', async () => {
    const { agent, db, orgId, close } = await createTestApp();
    try {
      const mod = await insertUser(db, { orgId, role: 'moderator' });
      const token = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
      const res = await agent
        .get('/mod/follow-up?min_age_unit=weeks')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    } finally {
      await close();
    }
  });

  it('honors no_prayers=true and min_age_value=7&min_age_unit=days', async () => {
    const { agent, db, orgId, close } = await createTestApp();
    try {
      const mod = await insertUser(db, { orgId, role: 'moderator' });
      const author = await insertUser(db, { orgId, role: 'member' });
      const young = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
      const old = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
      await db
        .updateTable('posts')
        .set({ created_at: new Date(Date.now() - 14 * 24 * 3600_000) })
        .where('id', '=', old.id)
        .execute();
      const token = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
      const res = await agent
        .get('/mod/follow-up?no_prayers=true&min_age_value=7&min_age_unit=days')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.items.map((p: { id: string }) => p.id)).toEqual([old.id]);
      expect(res.body.items.map((p: { id: string }) => p.id)).not.toContain(young.id);
    } finally {
      await close();
    }
  });

  it('cursor pagination round-trips', async () => {
    const { agent, db, orgId, close } = await createTestApp();
    try {
      const mod = await insertUser(db, { orgId, role: 'moderator' });
      const author = await insertUser(db, { orgId, role: 'member' });
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const p = await insertPost(db, {
          authorId: author.id,
          orgId,
          status: 'published',
          body: `p${i}`,
        });
        ids.push(p.id);
        await new Promise((r) => setTimeout(r, 2));
      }
      const token = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
      const res1 = await agent
        .get('/mod/follow-up?sort=oldest')
        .set('Authorization', `Bearer ${token}`);
      expect(res1.status).toBe(200);
      expect(res1.body.items).toHaveLength(3);
    } finally {
      await close();
    }
  });
});
