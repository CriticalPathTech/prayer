import { randomUUID } from 'node:crypto';

import { newId } from '@prayer/db';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { mintTestJwt, mintExpiredJwt } from '../helpers/jwt.js';
import { insertUser } from '../helpers/seed.js';
import { createTestApp } from '../helpers/supertest.js';

afterEach(async () => {
  // Each test creates its own TestApp and closes it inside the test.
  // No shared state to clean up here.
});

describe('requireAuth attaches role and orgId from user_orgs', () => {
  it('moderator role from user_orgs surfaces on req.user', async () => {
    const ctx = await createTestApp();
    try {
      const user = await insertUser(ctx.db, {
        orgId: ctx.orgId,
        email: 'mod@x.com',
        role: 'moderator',
        displayName: 'mod',
      });
      const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
      const res = await request(ctx.app).get('/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('moderator');
      expect(res.body.orgId).toBe(ctx.orgId);
    } finally {
      await ctx.db.deleteFrom('user_orgs').execute();
      await ctx.db.deleteFrom('users').execute();
      await ctx.close();
    }
  });
});

describe('requireAuth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const ctx = await createTestApp();
    try {
      const res = await request(ctx.app).get('/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    } finally {
      await ctx.close();
    }
  });

  it('returns 401 when token is malformed', async () => {
    const ctx = await createTestApp();
    try {
      const res = await request(ctx.app).get('/me').set('Authorization', 'Bearer garbage');
      expect(res.status).toBe(401);
    } finally {
      await ctx.close();
    }
  });

  it('returns 401 when token is expired', async () => {
    const sub = randomUUID();
    const token = await mintExpiredJwt({ sub, email: 'e@x.com' });
    const ctx = await createTestApp();
    try {
      const res = await request(ctx.app).get('/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    } finally {
      await ctx.close();
    }
  });

  it('returns 403 FORBIDDEN when token is valid but user has no membership in this org', async () => {
    const sub = randomUUID();
    const token = await mintTestJwt({ sub, email: 'newbie@x.com' });
    const ctx = await createTestApp();
    try {
      const res = await request(ctx.app).get('/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      const rows = await ctx.db.selectFrom('users').selectAll().execute();
      expect(rows).toHaveLength(0);
    } finally {
      await ctx.close();
    }
  });

  it('JWT for userA pointed at orgB host returns 403', async () => {
    // Create orgA (testchurch, default) and orgB. userA is a member of orgA only.
    // Sending userA's JWT with a Host pointing at orgB → 403 because userA has
    // no user_orgs row for orgB.
    const ctxA = await createTestApp({ host: 'testchurch.prays.online' });
    try {
      // Insert orgB so orgContext can resolve it when the Host header says orgB.
      await ctxA.db
        .insertInto('orgs')
        .values({ id: newId(), slug: 'cross-host-b', display_name: 'Cross B' })
        .onConflict((oc) => oc.column('slug').doNothing())
        .execute();

      const userA = await insertUser(ctxA.db, { orgId: ctxA.orgId, email: 'a@cross-host.com' });
      const tok = await mintTestJwt({ sub: userA.supabaseAuthId, email: userA.email });

      // Override the Host header to point at orgB; the wrapper shim only replaces
      // 127.0.0.1/::1 hosts, so an explicit Host header passes through to orgContext.
      const res = await request(ctxA.app)
        .get('/me')
        .set('Host', 'cross-host-b.prays.online')
        .set('Authorization', `Bearer ${tok}`);
      expect(res.status).toBe(403);
    } finally {
      await ctxA.db.deleteFrom('user_orgs').execute();
      await ctxA.db.deleteFrom('users').execute();
      await ctxA.db.deleteFrom('orgs').where('slug', '=', 'cross-host-b').execute();
      await ctxA.close();
    }
  });
});
