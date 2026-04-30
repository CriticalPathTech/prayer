import { newId } from '@prayer/db';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { mintInviteCode, retireInviteCode } from '../../src/services/invite-codes.js';
import { mintTestJwt } from '../helpers/jwt.js';
import { insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('GET /me', () => {
  let ctx: TestApp;
  let orgId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    orgId = ctx.orgId;
  });

  afterAll(async () => {
    await ctx.close();
  });

  afterEach(async () => {
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('returns 401 with no token', async () => {
    const res = await request(ctx.app).get('/me');
    expect(res.status).toBe(401);
  });

  it('returns 403 for a supabase-authed user with no org membership', async () => {
    const token = await mintTestJwt({ sub: newId(), email: 'orphan@example.com' });
    const res = await request(ctx.app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 200 with user DTO for a supabase-authed user with a users row', async () => {
    const user = await insertUser(ctx.db, { orgId, email: 'ok@example.com', displayName: 'ok' });
    const token = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
  });

  it('includes avatar_url (null when unset) on the DTO', async () => {
    const user = await insertUser(ctx.db, { orgId, email: 'a@e.com', displayName: 'A' });
    const jwt = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app).get('/me').set('Authorization', `Bearer ${jwt}`);
    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toBeNull();
  });
});

describe('GET /me/invites', () => {
  let ctx: TestApp;
  let orgId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    orgId = ctx.orgId;
  });

  afterAll(async () => {
    await ctx.close();
  });

  afterEach(async () => {
    await ctx.db.deleteFrom('invitations').execute();
    await ctx.db.deleteFrom('invite_codes').execute();
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('returns empty active/retired for caller with no codes', async () => {
    const user = await insertUser(ctx.db, { orgId });
    const jwt = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app).get('/me/invites').set('Authorization', `Bearer ${jwt}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ active: [], retired: [] });
  });

  it('partitions codes by is_active and includes redemptions', async () => {
    const user = await insertUser(ctx.db, { orgId });
    const active = await mintInviteCode(ctx.db, { ownerId: user.id, orgId, seatCap: 3 });
    const retired = await mintInviteCode(ctx.db, { ownerId: user.id, orgId, seatCap: 2 });
    await retireInviteCode(ctx.db, { codeId: retired.id, orgId });

    // Redeem one seat against the active code.
    const invitee = await insertUser(ctx.db, { orgId, email: 'invitee@test.local' });
    await ctx.db
      .insertInto('invitations')
      .values({
        id: newId(),
        org_id: orgId,
        invite_code_id: active.id,
        invitor_id: user.id,
        invitee_id: invitee.id,
      })
      .execute();

    const jwt = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app).get('/me/invites').set('Authorization', `Bearer ${jwt}`);
    expect(res.status).toBe(200);
    expect(res.body.active).toHaveLength(1);
    expect(res.body.retired).toHaveLength(1);
    expect(res.body.active[0].id).toBe(active.id);
    expect(res.body.retired[0].id).toBe(retired.id);
    expect(res.body.active[0].redemptions).toHaveLength(1);
    expect(res.body.active[0].redemptions[0].invitee_id).toBe(invitee.id);
  });
});

describe('PATCH /me', () => {
  let ctx: TestApp;
  let orgId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    orgId = ctx.orgId;
  });

  afterAll(async () => {
    await ctx.close();
  });

  afterEach(async () => {
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('updates display_name and returns the new DTO', async () => {
    const user = await insertUser(ctx.db, { orgId, email: 'a@e.com', displayName: 'Old' });
    const jwt = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .patch('/me')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ display_name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('New Name');
  });

  it('sanitizes HTML characters', async () => {
    const user = await insertUser(ctx.db, { orgId, email: 'b@e.com', displayName: 'Old' });
    const jwt = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .patch('/me')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ display_name: '<img src=x>Ben</img>' });
    expect(res.status).toBe(200);
    expect(res.body.display_name).not.toContain('<');
    expect(res.body.display_name).toContain('Ben');
  });

  it('400 VALIDATION_ERROR when body is missing display_name', async () => {
    const user = await insertUser(ctx.db, { orgId, email: 'c@e.com', displayName: 'Old' });
    const jwt = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app).patch('/me').set('Authorization', `Bearer ${jwt}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 VALIDATION_ERROR when sanitize strips everything', async () => {
    const user = await insertUser(ctx.db, { orgId, email: 'd@e.com', displayName: 'Old' });
    const jwt = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .patch('/me')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ display_name: '<>' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('401 without JWT', async () => {
    const res = await request(ctx.app).patch('/me').send({ display_name: 'Anon' });
    expect(res.status).toBe(401);
  });
});

// A tiny valid 1x1 PNG (base64) used to synthesize a data URL.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==';

describe('POST /me/avatar', () => {
  let ctx: TestApp;
  let orgId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    orgId = ctx.orgId;
  });

  afterAll(async () => {
    await ctx.close();
  });

  afterEach(async () => {
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('uploads avatar and returns DTO with public avatar_url', async () => {
    const user = await insertUser(ctx.db, { orgId });
    const jwt = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .post('/me/avatar')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ image_data: `data:image/png;base64,${TINY_PNG_BASE64}` });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.email).toBe(user.email);
    expect(res.body.avatar_url).toMatch(/\/storage\/v1\/object\/public\/avatars\/.+\.webp$/);
    expect(ctx.storage.uploadCalls).toHaveLength(1);
    expect(ctx.storage.uploadCalls[0]?.bucket).toBe('avatars');
  });

  it('400 VALIDATION_ERROR on empty body', async () => {
    const user = await insertUser(ctx.db, { orgId });
    const jwt = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .post('/me/avatar')
      .set('Authorization', `Bearer ${jwt}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 VALIDATION_ERROR on unsupported MIME (gif)', async () => {
    const user = await insertUser(ctx.db, { orgId });
    const jwt = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app)
      .post('/me/avatar')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ image_data: `data:image/gif;base64,${TINY_PNG_BASE64}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('413 PAYLOAD_TOO_LARGE when decoded bytes exceed 2MB', async () => {
    const user = await insertUser(ctx.db, { orgId });
    const jwt = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 0).toString('base64');
    const res = await request(ctx.app)
      .post('/me/avatar')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ image_data: `data:image/png;base64,${big}` });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('401 without JWT', async () => {
    const res = await request(ctx.app)
      .post('/me/avatar')
      .send({ image_data: `data:image/png;base64,${TINY_PNG_BASE64}` });
    expect(res.status).toBe(401);
  });

  it('413 PAYLOAD_TOO_LARGE when raw body exceeds 3MB limit', async () => {
    const user = await insertUser(ctx.db, { orgId });
    const jwt = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    // Raw body > 3MB → body-parser rejects before our decoded-size check.
    // Use a buffer that base64-encodes to > 3MB.
    const oversized = 'x'.repeat(3 * 1024 * 1024 + 100); // 3MB + 100 bytes of raw string chars
    const res = await request(ctx.app)
      .post('/me/avatar')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ image_data: `data:image/webp;base64,${oversized}` });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('DELETE /me/avatar', () => {
  let ctx: TestApp;
  let orgId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    orgId = ctx.orgId;
  });

  afterAll(async () => {
    await ctx.close();
  });

  afterEach(async () => {
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  it('clears avatar_url and returns DTO with avatar_url: null', async () => {
    const user = await insertUser(ctx.db, { orgId });
    await ctx.db
      .updateTable('users')
      .set({ avatar_url: 'https://example.supabase.co/storage/v1/object/public/avatars/x.webp' })
      .where('id', '=', user.id)
      .execute();
    const jwt = await mintTestJwt({ sub: user.supabaseAuthId, email: user.email });
    const res = await request(ctx.app).delete('/me/avatar').set('Authorization', `Bearer ${jwt}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.avatar_url).toBeNull();

    const row = await ctx.db
      .selectFrom('users')
      .select('avatar_url')
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    expect(row.avatar_url).toBeNull();
  });
});
