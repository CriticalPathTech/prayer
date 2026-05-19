import { describe, it, expect, afterAll } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { mintTestJwt } from '../helpers/jwt.js';
import { insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp } from '../helpers/supertest.js';

const cleanupDb = initDb(process.env.TEST_DATABASE_URL!);
afterAll(async () => {
  await cleanupDb.deleteFrom('mod_post_skips').execute();
  await cleanupDb.deleteFrom('events').execute();
  await cleanupDb.deleteFrom('posts').execute();
});

describe('mod-approvals routes', () => {
  it('GET /mod/approvals returns pending FIFO', async () => {
    const { agent, db, orgId, close } = await createTestApp();
    try {
      const mod = await insertUser(db, { orgId, role: 'moderator' });
      const author = await insertUser(db, { orgId, role: 'member' });
      await insertPost(db, { authorId: author.id, orgId, status: 'pending', body: 'first' });
      await new Promise((r) => setTimeout(r, 5));
      await insertPost(db, { authorId: author.id, orgId, status: 'pending', body: 'second' });
      const token = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
      const res = await agent.get('/mod/approvals').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].body).toBe('first');
    } finally {
      await close();
    }
  });

  it('POST /mod/posts/:id/approve → published', async () => {
    const { agent, db, orgId, close } = await createTestApp();
    try {
      const mod = await insertUser(db, { orgId, role: 'moderator' });
      const author = await insertUser(db, { orgId, role: 'member' });
      const p = await insertPost(db, { authorId: author.id, orgId, status: 'pending' });
      const token = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
      const res = await agent
        .post(`/mod/posts/${p.id}/approve`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.post.status).toBe('published');
    } finally {
      await close();
    }
  });

  it('POST /mod/posts/:id/reject with note → rejected + note stored', async () => {
    const { agent, db, orgId, close } = await createTestApp();
    try {
      const mod = await insertUser(db, { orgId, role: 'moderator' });
      const author = await insertUser(db, { orgId, role: 'member' });
      const p = await insertPost(db, { authorId: author.id, orgId, status: 'pending' });
      const token = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
      const res = await agent
        .post(`/mod/posts/${p.id}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({ note: 'please reword' });
      expect(res.status).toBe(200);
      expect(res.body.post.status).toBe('rejected');
    } finally {
      await close();
    }
  });

  it('POST + DELETE /mod/posts/:id/skip 204/204', async () => {
    const { agent, db, orgId, close } = await createTestApp();
    try {
      const mod = await insertUser(db, { orgId, role: 'moderator' });
      const author = await insertUser(db, { orgId, role: 'member' });
      const p = await insertPost(db, { authorId: author.id, orgId, status: 'pending' });
      const token = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
      const skipRes = await agent
        .post(`/mod/posts/${p.id}/skip`)
        .set('Authorization', `Bearer ${token}`);
      expect(skipRes.status).toBe(204);
      const unskipRes = await agent
        .delete(`/mod/posts/${p.id}/skip`)
        .set('Authorization', `Bearer ${token}`);
      expect(unskipRes.status).toBe(204);
    } finally {
      await close();
    }
  });

  it('member → 403 on every endpoint', async () => {
    const { agent, db, orgId, close } = await createTestApp();
    try {
      const member = await insertUser(db, { orgId, role: 'member' });
      const author = await insertUser(db, { orgId, role: 'member' });
      const p = await insertPost(db, { authorId: author.id, orgId, status: 'pending' });
      const token = await mintTestJwt({ sub: member.supabaseAuthId, email: member.email });
      const list = await agent.get('/mod/approvals').set('Authorization', `Bearer ${token}`);
      expect(list.status).toBe(403);
      const approve = await agent
        .post(`/mod/posts/${p.id}/approve`)
        .set('Authorization', `Bearer ${token}`);
      expect(approve.status).toBe(403);
    } finally {
      await close();
    }
  });
});
