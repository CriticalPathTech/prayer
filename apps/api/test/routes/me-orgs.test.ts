import { newId } from '@prayer/db';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { mintTestJwt } from '../helpers/jwt.js';
import { insertOrg, insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('GET /me/orgs', () => {
  let ctx: TestApp;
  let hopechurchOrgId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    hopechurchOrgId = ctx.orgId;
  });

  afterAll(async () => {
    await ctx.close();
  });

  afterEach(async () => {
    // Clean memberships + users between tests; leave orgs (used by other suites).
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('returns 401 without a Bearer token', async () => {
    // No Host required — this route runs before orgContext, but supertest still
    // injects the default test host via the wrapper. Either way we expect 401.
    const res = await request(ctx.app).get('/me/orgs');
    expect(res.status).toBe(401);
  });

  it('does not require X-Org-Slug or a per-org Host (auth-only)', async () => {
    // Verify we can hit /me/orgs from a hostname that does NOT resolve to any org
    // (e.g. the per-cell api endpoint). The route must answer without orgContext.
    const user = await insertUser(ctx.db, {
      orgId: hopechurchOrgId,
      email: 'pre-pick@example.com',
      displayName: 'pre',
    });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .get('/me/orgs')
      .set('Host', 'api.staging.prays.online')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.orgs).toHaveLength(1);
    expect(res.body.orgs[0]).toMatchObject({
      org_id: hopechurchOrgId,
      slug: 'hopechurch',
      role: 'member',
    });
  });

  it('returns empty list when supabase identity has no users row yet', async () => {
    // Pre-onboarding: JWT verifies, but no users row exists for the sub.
    const token = await mintTestJwt({ sub: newId(), email: 'never-onboarded@example.com' });
    const res = await request(ctx.app).get('/me/orgs').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.orgs).toEqual([]);
  });

  it('returns multiple memberships when the user belongs to several orgs', async () => {
    const otherOrgId = await insertOrg(ctx.db, { slug: 'aaa-other-org', displayName: 'Other' });
    const user = await insertUser(ctx.db, {
      orgId: hopechurchOrgId,
      email: 'multi@example.com',
      displayName: 'multi',
    });
    // Add a second membership for the same supabase identity.
    await ctx.db
      .insertInto('user_orgs')
      .values({ user_id: user.id, org_id: otherOrgId, role: 'member' })
      .execute();
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app).get('/me/orgs').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Sorted by slug ascending → 'aaa-other-org' first, then 'hopechurch'.
    expect(res.body.orgs.map((o: { slug: string }) => o.slug)).toEqual([
      'aaa-other-org',
      'hopechurch',
    ]);
  });

  it('exposes the user role for each membership', async () => {
    const user = await insertUser(ctx.db, {
      orgId: hopechurchOrgId,
      email: 'mod@example.com',
      displayName: 'mod',
      role: 'moderator',
    });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app).get('/me/orgs').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.orgs[0].role).toBe('moderator');
  });
});
