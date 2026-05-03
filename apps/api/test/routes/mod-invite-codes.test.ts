import { newId } from '@prayer/db';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { mintInviteCode } from '../../src/services/invite-codes.js';
import { mintTestJwt } from '../helpers/jwt.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('moderator invite-code routes', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  afterEach(async () => {
    await ctx.db.deleteFrom('invitations').execute();
    await ctx.db.deleteFrom('invite_codes').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  async function makeUser(name: string, role: 'member' | 'moderator' = 'member') {
    const id = newId();
    const subj = newId();
    await ctx.db
      .insertInto('users')
      .values({
        id,
        supabase_auth_id: subj,
        email: `${id}@e.com`,
        display_name: name,
        role,
      })
      .execute();
    return { id, jwt: await mintTestJwt({ sub: subj, email: `${id}@e.com` }) };
  }

  it('non-moderator cannot grant', async () => {
    const member = await makeUser('m', 'member');
    const target = await makeUser('t');
    const res = await request(ctx.app)
      .post('/mod/invite-codes')
      .set('Authorization', `Bearer ${member.jwt}`)
      .send({ owner_id: target.id, seat_cap: 3 });
    expect(res.status).toBe(403);
  });

  it('moderator grants a code', async () => {
    const mod = await makeUser('m', 'moderator');
    const target = await makeUser('t');
    const res = await request(ctx.app)
      .post('/mod/invite-codes')
      .set('Authorization', `Bearer ${mod.jwt}`)
      .send({ owner_id: target.id, seat_cap: 5 });
    expect(res.status).toBe(200);
    expect(res.body.seat_cap).toBe(5);
    expect(res.body.seats_remaining).toBe(5);
    expect(res.body.code).toMatch(/^[a-z0-9]{5}$/);
  });

  it('rejects seat_cap > 10', async () => {
    const mod = await makeUser('m', 'moderator');
    const target = await makeUser('t');
    const res = await request(ctx.app)
      .post('/mod/invite-codes')
      .set('Authorization', `Bearer ${mod.jwt}`)
      .send({ owner_id: target.id, seat_cap: 50 });
    expect(res.status).toBe(400);
  });

  it('retire preserves redemption history', async () => {
    const mod = await makeUser('m', 'moderator');
    const target = await makeUser('t');
    const c = await mintInviteCode(ctx.db, { ownerId: target.id, seatCap: 3 });
    const res = await request(ctx.app)
      .post(`/mod/invite-codes/${c.id}/retire`)
      .set('Authorization', `Bearer ${mod.jwt}`);
    expect(res.status).toBe(200);
    const row = await ctx.db
      .selectFrom('invite_codes')
      .selectAll()
      .where('id', '=', c.id)
      .executeTakeFirstOrThrow();
    expect(row.is_active).toBe(false);
    expect(row.seats_remaining).toBe(3);
  });

  it('search returns prefix matches', async () => {
    const mod = await makeUser('m', 'moderator');
    await makeUser('Benjamin Franklin');
    await makeUser('Bobby');
    await makeUser('Zora');
    const res = await request(ctx.app)
      .get('/mod/users/search?q=b')
      .set('Authorization', `Bearer ${mod.jwt}`);
    expect(res.status).toBe(200);
    const names = res.body.map((u: { display_name: string }) => u.display_name).sort();
    expect(names).toContain('Benjamin Franklin');
    expect(names).toContain('Bobby');
  });

  it('lists codes with redemptions for owner', async () => {
    const mod = await makeUser('m', 'moderator');
    const target = await makeUser('t');
    await mintInviteCode(ctx.db, { ownerId: target.id, seatCap: 3 });
    const res = await request(ctx.app)
      .get(`/mod/invite-codes?owner_id=${target.id}`)
      .set('Authorization', `Bearer ${mod.jwt}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].redemptions).toEqual([]);
  });
});
