import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { mintInviteCode } from '../../src/services/invite-codes.js';
import { insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('GET /invite-codes/:code', () => {
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

  it('returns valid with seats info', async () => {
    const owner = await insertUser(ctx.db, { email: 'ben@test.local' });
    await ctx.db
      .updateTable('users')
      .set({ display_name: 'Ben' })
      .where('id', '=', owner.id)
      .execute();
    const code = await mintInviteCode(ctx.db, { ownerId: owner.id, seatCap: 3 });
    const res = await request(ctx.app).get(`/invite-codes/${code.code}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'valid',
      invitor_display_name: 'Ben',
      seat_cap: 3,
      seats_remaining: 3,
    });
  });

  it('returns not_found for unknown code', async () => {
    const res = await request(ctx.app).get('/invite-codes/zzzzz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'not_found' });
  });

  it('returns full when seats exhausted', async () => {
    const owner = await insertUser(ctx.db, { email: 'ben2@test.local' });
    await ctx.db
      .updateTable('users')
      .set({ display_name: 'Ben' })
      .where('id', '=', owner.id)
      .execute();
    const code = await mintInviteCode(ctx.db, { ownerId: owner.id, seatCap: 1 });
    await ctx.db
      .updateTable('invite_codes')
      .set({ seats_remaining: 0 })
      .where('id', '=', code.id)
      .execute();
    const res = await request(ctx.app).get(`/invite-codes/${code.code}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('full');
  });

  it('accepts uppercase input', async () => {
    const owner = await insertUser(ctx.db, { email: 'ben3@test.local' });
    await ctx.db
      .updateTable('users')
      .set({ display_name: 'Ben' })
      .where('id', '=', owner.id)
      .execute();
    const code = await mintInviteCode(ctx.db, { ownerId: owner.id, seatCap: 3 });
    const res = await request(ctx.app).get(`/invite-codes/${code.code.toUpperCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('valid');
  });
});
