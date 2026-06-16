import { newId } from '@prayer/db';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { mintTestJwt } from '../helpers/jwt.js';
import { insertOrg, insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('GET /admin/church/members', () => {
  let app: TestApp;
  let suToken: string;
  let memberToken: string;
  let modToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    const orgId = await insertOrg(app.db, {
      slug: 'admin-church-routes',
      displayName: 'Admin Church Routes',
    });
    const su = await insertUser(app.db, { email: 'su@acr.com', orgId, role: 'super_user' });
    const member = await insertUser(app.db, { email: 'member@acr.com', orgId, role: 'member' });
    const mod = await insertUser(app.db, { email: 'mod@acr.com', orgId, role: 'moderator' });
    suToken = await mintTestJwt({ sub: su.supabaseAuthId, email: su.email });
    memberToken = await mintTestJwt({ sub: member.supabaseAuthId, email: member.email });
    modToken = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
  });

  afterAll(async () => {
    await app.close();
  });

  it('401 without JWT', async () => {
    const res = await request(app.app)
      .get('/admin/church/members')
      .set('Host', 'admin-church-routes.prays.online');
    expect(res.status).toBe(401);
  });

  it('403 for member', async () => {
    const res = await request(app.app)
      .get('/admin/church/members')
      .set('Host', 'admin-church-routes.prays.online')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });

  it('403 for moderator', async () => {
    const res = await request(app.app)
      .get('/admin/church/members')
      .set('Host', 'admin-church-routes.prays.online')
      .set('Authorization', `Bearer ${modToken}`);
    expect(res.status).toBe(403);
  });

  it('200 for super_user with member rows', async () => {
    const res = await request(app.app)
      .get('/admin/church/members')
      .set('Host', 'admin-church-routes.prays.online')
      .set('Authorization', `Bearer ${suToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(res.body.members).toHaveLength(3);
    const emails = res.body.members.map((m: { email: string }) => m.email).sort();
    expect(emails).toEqual(['member@acr.com', 'mod@acr.com', 'su@acr.com']);
    const su = res.body.members.find((m: { email: string }) => m.email === 'su@acr.com');
    expect(su).toMatchObject({
      displayName: expect.any(String),
      role: 'super_user',
      avatarUrl: null,
    });
    expect(su.joinedAt).toBeTruthy();
  });

  it("200 response includes the org's current displayName and superUserCount", async () => {
    const res = await request(app.app)
      .get('/admin/church/members')
      .set('Host', 'admin-church-routes.prays.online')
      .set('Authorization', `Bearer ${suToken}`);
    expect(res.status).toBe(200);
    expect(res.body.org).toEqual({
      displayName: 'Admin Church Routes',
      requiresPostApproval: false,
    });
    expect(typeof res.body.superUserCount).toBe('number');
    expect(res.body.superUserCount).toBe(1); // only su@acr.com is super_user
  });
});

describe('DELETE /admin/church/members/:userId', () => {
  let app: TestApp;
  let suToken: string;
  let memberToken: string;
  let suId: string;
  let memberId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const orgId = await insertOrg(app.db, {
      slug: 'admin-church-del',
      displayName: 'Admin Church Del',
    });
    const su = await insertUser(app.db, { email: 'su@acd.com', orgId, role: 'super_user' });
    const member = await insertUser(app.db, { email: 'member@acd.com', orgId, role: 'member' });
    suToken = await mintTestJwt({ sub: su.supabaseAuthId, email: su.email });
    memberToken = await mintTestJwt({ sub: member.supabaseAuthId, email: member.email });
    suId = su.id;
    memberId = member.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('204 when super_user removes a member', async () => {
    const res = await request(app.app)
      .delete(`/admin/church/members/${memberId}`)
      .set('Host', 'admin-church-del.prays.online')
      .set('Authorization', `Bearer ${suToken}`);
    expect(res.status).toBe(204);
  });

  it('403 when target is self', async () => {
    const res = await request(app.app)
      .delete(`/admin/church/members/${suId}`)
      .set('Host', 'admin-church-del.prays.online')
      .set('Authorization', `Bearer ${suToken}`);
    expect(res.status).toBe(403);
  });

  it('404 when target is not a member of this org', async () => {
    const ghost = newId();
    const res = await request(app.app)
      .delete(`/admin/church/members/${ghost}`)
      .set('Host', 'admin-church-del.prays.online')
      .set('Authorization', `Bearer ${suToken}`);
    expect(res.status).toBe(404);
  });

  it('403 when caller is a member (not super_user)', async () => {
    const res = await request(app.app)
      .delete(`/admin/church/members/${suId}`)
      .set('Host', 'admin-church-del.prays.online')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /admin/church/members/:userId', () => {
  let app: TestApp;
  let suToken: string;
  let memberToken: string;
  let modToken: string;
  let suId: string;
  let memberId: string;
  let modId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const orgId = await insertOrg(app.db, {
      slug: 'admin-church-role',
      displayName: 'Admin Church Role',
    });
    const su = await insertUser(app.db, { email: 'su@acrole.com', orgId, role: 'super_user' });
    const member = await insertUser(app.db, {
      email: 'member@acrole.com',
      orgId,
      role: 'member',
    });
    const mod = await insertUser(app.db, { email: 'mod@acrole.com', orgId, role: 'moderator' });
    suToken = await mintTestJwt({ sub: su.supabaseAuthId, email: su.email });
    memberToken = await mintTestJwt({ sub: member.supabaseAuthId, email: member.email });
    modToken = await mintTestJwt({ sub: mod.supabaseAuthId, email: mod.email });
    suId = su.id;
    memberId = member.id;
    modId = mod.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('401 without JWT', async () => {
    const res = await request(app.app)
      .patch(`/admin/church/members/${memberId}`)
      .set('Host', 'admin-church-role.prays.online')
      .send({ role: 'moderator' });
    expect(res.status).toBe(401);
  });

  it('403 for member caller', async () => {
    const res = await request(app.app)
      .patch(`/admin/church/members/${memberId}`)
      .set('Host', 'admin-church-role.prays.online')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ role: 'moderator' });
    expect(res.status).toBe(403);
  });

  it('403 for moderator caller', async () => {
    const res = await request(app.app)
      .patch(`/admin/church/members/${memberId}`)
      .set('Host', 'admin-church-role.prays.online')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ role: 'moderator' });
    expect(res.status).toBe(403);
  });

  it('200 super_user promotes member → moderator, response carries updated role', async () => {
    const res = await request(app.app)
      .patch(`/admin/church/members/${memberId}`)
      .set('Host', 'admin-church-role.prays.online')
      .set('Authorization', `Bearer ${suToken}`)
      .send({ role: 'moderator' });
    expect(res.status).toBe(200);
    expect(res.body.member).toMatchObject({ id: memberId, role: 'moderator' });
  });

  it('400 on missing role', async () => {
    const res = await request(app.app)
      .patch(`/admin/church/members/${modId}`)
      .set('Host', 'admin-church-role.prays.online')
      .set('Authorization', `Bearer ${suToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('400 on invalid role value', async () => {
    const res = await request(app.app)
      .patch(`/admin/church/members/${modId}`)
      .set('Host', 'admin-church-role.prays.online')
      .set('Authorization', `Bearer ${suToken}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('403 super_user attempting self-change', async () => {
    const res = await request(app.app)
      .patch(`/admin/church/members/${suId}`)
      .set('Host', 'admin-church-role.prays.online')
      .set('Authorization', `Bearer ${suToken}`)
      .send({ role: 'moderator' });
    expect(res.status).toBe(403);
  });

  it('404 when target is not in this org', async () => {
    const ghost = newId();
    const res = await request(app.app)
      .patch(`/admin/church/members/${ghost}`)
      .set('Host', 'admin-church-role.prays.online')
      .set('Authorization', `Bearer ${suToken}`)
      .send({ role: 'moderator' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /admin/church/settings', () => {
  let app: TestApp;
  let suToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    const orgId = await insertOrg(app.db, { slug: 'admin-church-set', displayName: 'Original' });
    const su = await insertUser(app.db, { email: 'su@acs.com', orgId, role: 'super_user' });
    suToken = await mintTestJwt({ sub: su.supabaseAuthId, email: su.email });
  });

  afterAll(async () => {
    await app.close();
  });

  it('200 with new display name', async () => {
    const res = await request(app.app)
      .patch('/admin/church/settings')
      .set('Host', 'admin-church-set.prays.online')
      .set('Authorization', `Bearer ${suToken}`)
      .send({ displayName: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.org.displayName).toBe('Renamed');
  });

  it('400 on empty displayName', async () => {
    const res = await request(app.app)
      .patch('/admin/church/settings')
      .set('Host', 'admin-church-set.prays.online')
      .set('Authorization', `Bearer ${suToken}`)
      .send({ displayName: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('church logo endpoints', () => {
  let app: TestApp;
  let suToken: string;
  let memberToken: string;
  const HOST = 'church-logo.prays.online';
  const SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#000000"/><rect x="2" y="2" width="6" height="6" fill="#ffffff"/></svg>';

  beforeAll(async () => {
    app = await createTestApp();
    const orgId = await insertOrg(app.db, { slug: 'church-logo', displayName: 'Church Logo' });
    const su = await insertUser(app.db, { email: 'su@cl.com', orgId, role: 'super_user' });
    const member = await insertUser(app.db, { email: 'm@cl.com', orgId, role: 'member' });
    suToken = await mintTestJwt({ sub: su.supabaseAuthId, email: su.email });
    memberToken = await mintTestJwt({ sub: member.supabaseAuthId, email: member.email });
  });
  afterAll(async () => {
    await app.close();
  });

  it('403 for a member calling preview', async () => {
    const res = await request(app.app)
      .post('/admin/church/logo/preview')
      .set('Host', HOST)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ svg: SVG });
    expect(res.status).toBe(403);
  });

  it('preview returns sanitized svg + multiColor warning', async () => {
    const res = await request(app.app)
      .post('/admin/church/logo/preview')
      .set('Host', HOST)
      .set('Authorization', `Bearer ${suToken}`)
      .send({ svg: `${SVG}<script>alert(1)</script>` });
    expect(res.status).toBe(200);
    expect(res.body.sanitizedSvg).toContain('<svg');
    expect(res.body.sanitizedSvg).not.toContain('script');
    expect(res.body.warnings.multiColor).toBe(true);
    expect(res.body.warnings.strippedTags).toContain('script');
    expect(res.body.detectedColors).toEqual(expect.arrayContaining(['#000000', '#ffffff']));
  });

  it('preview 400 on non-svg', async () => {
    const res = await request(app.app)
      .post('/admin/church/logo/preview')
      .set('Host', HOST)
      .set('Authorization', `Bearer ${suToken}`)
      .send({ svg: '<div>nope</div>' });
    expect(res.status).toBe(400);
  });

  it('put saves the logo and GET /org reflects it', async () => {
    const put = await request(app.app)
      .put('/admin/church/logo')
      .set('Host', HOST)
      .set('Authorization', `Bearer ${suToken}`)
      .send({ svg: SVG, fillMode: 'custom', color: '#123456' });
    expect(put.status).toBe(200);
    expect(put.body.logo).toMatchObject({ fillMode: 'custom', color: '#123456' });

    const org = await request(app.app).get('/org').set('Host', HOST);
    expect(org.body.logo.fillMode).toBe('custom');
  });

  it('put 400 when custom mode has no hex color', async () => {
    const res = await request(app.app)
      .put('/admin/church/logo')
      .set('Host', HOST)
      .set('Authorization', `Bearer ${suToken}`)
      .send({ svg: SVG, fillMode: 'custom' });
    expect(res.status).toBe(400);
  });

  it('delete clears the logo', async () => {
    await request(app.app)
      .put('/admin/church/logo')
      .set('Host', HOST)
      .set('Authorization', `Bearer ${suToken}`)
      .send({ svg: SVG, fillMode: 'original' });
    const del = await request(app.app)
      .delete('/admin/church/logo')
      .set('Host', HOST)
      .set('Authorization', `Bearer ${suToken}`);
    expect(del.status).toBe(204);
    const org = await request(app.app).get('/org').set('Host', HOST);
    expect(org.body.logo).toBeNull();
  });
});

describe('PATCH /admin/church/settings — approval gate', () => {
  // Reset the testchurch row + clear any leftover posts/events after every
  // test in this block so subsequent test files don't trip the
  // posts_author_id_fkey constraint on their `deleteFrom('users')` cleanups.
  afterEach(async () => {
    const { db, orgId, close } = await createTestApp();
    try {
      await db.deleteFrom('posts').where('org_id', '=', orgId).execute();
      await db.deleteFrom('events').where('org_id', '=', orgId).execute();
      await db
        .updateTable('orgs')
        .set({ requires_post_approval: false, display_name: 'Testchurch (test default)' })
        .where('id', '=', orgId)
        .execute();
    } finally {
      await close();
    }
  });

  it('flips requires_post_approval', async () => {
    const { agent, db, orgId, close } = await createTestApp();
    try {
      const su = await insertUser(db, { orgId, role: 'super_user' });
      const token = await mintTestJwt({ sub: su.supabaseAuthId, email: su.email });
      // Use the seeded displayName verbatim so this test doesn't mutate the
      // global "testchurch" org row that other test files depend on
      // (org.test.ts asserts on the seeded displayName).
      const res = await agent
        .patch('/admin/church/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Testchurch (test default)', requiresPostApproval: true });
      expect(res.status).toBe(200);
      expect(res.body.org.requiresPostApproval).toBe(true);
    } finally {
      await close();
    }
  });

  it('→ 409 when toggling off with pending posts', async () => {
    const { agent, db, orgId, close } = await createTestApp();
    try {
      const su = await insertUser(db, { orgId, role: 'super_user' });
      const member = await insertUser(db, { orgId, role: 'member' });
      await db
        .updateTable('orgs')
        .set({ requires_post_approval: true })
        .where('id', '=', orgId)
        .execute();
      await insertPost(db, { authorId: member.id, orgId, status: 'pending' });
      const token = await mintTestJwt({ sub: su.supabaseAuthId, email: su.email });
      const res = await agent
        .patch('/admin/church/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Testchurch (test default)', requiresPostApproval: false });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PENDING_POSTS_EXIST');
      expect(res.body.error.count).toBe(1);
    } finally {
      await close();
    }
  });
});
