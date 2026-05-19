import { newId } from '@prayer/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { mintTestJwt } from '../helpers/jwt.js';
import { insertOrg, insertUser } from '../helpers/seed.js';
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
    expect(res.body.org).toEqual({ displayName: 'Admin Church Routes', requiresPostApproval: false });
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
