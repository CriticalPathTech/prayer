import { createDb, newId } from '@prayer/db';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest';

import { redeemInvitation } from '../../src/services/invitations.js';
import { mintInviteCode } from '../../src/services/invite-codes.js';
import { mintTestJwt } from '../helpers/jwt.js';
import { insertOrg } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

const db = createDb(process.env.DATABASE_URL!);

async function insertBareUser(displayName: string) {
  const id = newId();
  await db
    .insertInto('users')
    .values({
      id,
      supabase_auth_id: newId(),
      email: `${id}@example.com`,
      display_name: displayName,
    })
    .execute();
  return id;
}

describe('redeemInvitation', () => {
  let orgId: string;

  beforeAll(async () => {
    orgId = await insertOrg(db, { slug: `redeem-svc-${newId().slice(0, 8)}` });
  });

  afterEach(async () => {
    await db.deleteFrom('invitations').execute();
    await db.deleteFrom('invite_codes').execute();
    await db.deleteFrom('events').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  afterAll(async () => {
    await db.deleteFrom('orgs').where('id', '=', orgId).execute();
  });

  it('creates user row + invitation + new initial code in one transaction', async () => {
    const owner = await insertBareUser('Ben');
    const code = await mintInviteCode(db, { ownerId: owner, orgId, seatCap: 3 });

    const out = await redeemInvitation(db, {
      supabaseAuthId: newId(),
      email: 'alice@example.com',
      code: code.code,
    });

    expect(out.user.display_name).toBe('alice');
    const cRow = await db
      .selectFrom('invite_codes')
      .selectAll()
      .where('id', '=', code.id)
      .executeTakeFirstOrThrow();
    expect(cRow.seats_remaining).toBe(2);

    const inv = await db
      .selectFrom('invitations')
      .selectAll()
      .where('invitee_id', '=', out.user.id)
      .executeTakeFirstOrThrow();
    expect(inv.invitor_id).toBe(owner);
    expect(inv.invite_code_id).toBe(code.id);

    const ownCode = await db
      .selectFrom('invite_codes')
      .selectAll()
      .where('owner_id', '=', out.user.id)
      .executeTakeFirstOrThrow();
    expect(ownCode.seat_cap).toBe(3);

    const ev = await db
      .selectFrom('events')
      .selectAll()
      .where('type', '=', 'invitation.redeemed')
      .executeTakeFirstOrThrow();
    expect(ev).toBeDefined();

    // New member gets a user_orgs row in the org
    const uo = await db
      .selectFrom('user_orgs')
      .selectAll()
      .where('user_id', '=', out.user.id)
      .where('org_id', '=', orgId)
      .executeTakeFirstOrThrow();
    expect(uo.role).toBe('member');
  });

  it('throws CodeFullError when seats_remaining = 0', async () => {
    const owner = await insertBareUser('Ben');
    const code = await mintInviteCode(db, { ownerId: owner, orgId, seatCap: 1 });
    await db
      .updateTable('invite_codes')
      .set({ seats_remaining: 0 })
      .where('id', '=', code.id)
      .execute();

    await expect(
      redeemInvitation(db, { supabaseAuthId: newId(), email: 'a@example.com', code: code.code }),
    ).rejects.toHaveProperty('code', 'CODE_FULL');
  });

  it('throws CodeInactiveError when is_active = false', async () => {
    const owner = await insertBareUser('Ben');
    const code = await mintInviteCode(db, { ownerId: owner, orgId, seatCap: 3 });
    await db
      .updateTable('invite_codes')
      .set({ is_active: false })
      .where('id', '=', code.id)
      .execute();

    await expect(
      redeemInvitation(db, { supabaseAuthId: newId(), email: 'a@example.com', code: code.code }),
    ).rejects.toHaveProperty('code', 'CODE_INACTIVE');
  });

  it('throws CodeNotFoundError when code does not exist', async () => {
    await expect(
      redeemInvitation(db, { supabaseAuthId: newId(), email: 'a@example.com', code: 'zzzzz' }),
    ).rejects.toHaveProperty('code', 'CODE_NOT_FOUND');
  });

  it('is idempotent when same user re-clicks the email link (no new row, returns existing user)', async () => {
    const owner = await insertBareUser('Ben');
    const code = await mintInviteCode(db, { ownerId: owner, orgId, seatCap: 3 });
    const authId = newId();
    const first = await redeemInvitation(db, {
      supabaseAuthId: authId,
      email: 'a@example.com',
      code: code.code,
    });
    const second = await redeemInvitation(db, {
      supabaseAuthId: authId,
      email: 'a@example.com',
      code: code.code,
    });

    expect(second.user.id).toBe(first.user.id);
    const invCount = await db
      .selectFrom('invitations')
      .select(db.fn.countAll<string>().as('n'))
      .where('invitee_id', '=', first.user.id)
      .executeTakeFirstOrThrow();
    expect(Number(invCount.n)).toBe(1);
    const cRow = await db
      .selectFrom('invite_codes')
      .selectAll()
      .where('id', '=', code.id)
      .executeTakeFirstOrThrow();
    expect(cRow.seats_remaining).toBe(2);
  });

  it('throws AlreadyRedeemedError if the same user redeems a different code', async () => {
    const owner1 = await insertBareUser('Ben');
    const owner2 = await insertBareUser('Cara');
    const code1 = await mintInviteCode(db, { ownerId: owner1, orgId, seatCap: 3 });
    const code2 = await mintInviteCode(db, { ownerId: owner2, orgId, seatCap: 3 });
    const authId = newId();

    await redeemInvitation(db, {
      supabaseAuthId: authId,
      email: 'a@example.com',
      code: code1.code,
    });
    await expect(
      redeemInvitation(db, { supabaseAuthId: authId, email: 'a@example.com', code: code2.code }),
    ).rejects.toHaveProperty('code', 'ALREADY_REDEEMED');
  });

  it('two concurrent redeems of the last-seat code: one wins, one fails', async () => {
    const owner = await insertBareUser('Ben');
    const code = await mintInviteCode(db, { ownerId: owner, orgId, seatCap: 1 });
    const r1 = redeemInvitation(db, {
      supabaseAuthId: newId(),
      email: 'a@example.com',
      code: code.code,
    });
    const r2 = redeemInvitation(db, {
      supabaseAuthId: newId(),
      email: 'b@example.com',
      code: code.code,
    });
    const results = await Promise.allSettled([r1, r2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toHaveProperty('code', 'CODE_FULL');

    const cRow = await db
      .selectFrom('invite_codes')
      .selectAll()
      .where('id', '=', code.id)
      .executeTakeFirstOrThrow();
    expect(cRow.seats_remaining).toBe(0);
  });
});

describe('POST /invitations/redeem (HTTP)', () => {
  let ctx: TestApp;
  let orgId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    orgId = await insertOrg(ctx.db, { slug: `redeem-http-${newId().slice(0, 8)}` });
  });
  afterAll(async () => {
    await ctx.db.deleteFrom('orgs').where('id', '=', orgId).execute();
    await ctx.close();
  });
  afterEach(async () => {
    await ctx.db.deleteFrom('invitations').execute();
    await ctx.db.deleteFrom('invite_codes').execute();
    await ctx.db.deleteFrom('events').execute();
    await ctx.db.deleteFrom('user_orgs').execute();
    await ctx.db.deleteFrom('users').execute();
  });

  async function insertOwner(displayName: string): Promise<string> {
    const id = newId();
    await ctx.db
      .insertInto('users')
      .values({
        id,
        supabase_auth_id: newId(),
        email: `${id}@example.com`,
        display_name: displayName,
      })
      .execute();
    return id;
  }

  it('200 for a valid code with seats', async () => {
    const ownerId = await insertOwner('Ben');
    const code = await mintInviteCode(ctx.db, { ownerId, orgId, seatCap: 3 });
    const jwt = await mintTestJwt({ sub: newId(), email: 'alice@example.com' });
    const res = await request(ctx.app)
      .post('/invitations/redeem')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ code: code.code });
    expect(res.status).toBe(200);
    expect(res.body.user.display_name).toBe('alice');
  });

  it('409 code_full', async () => {
    const ownerId = await insertOwner('Ben');
    const code = await mintInviteCode(ctx.db, { ownerId, orgId, seatCap: 1 });
    await ctx.db
      .updateTable('invite_codes')
      .set({ seats_remaining: 0 })
      .where('id', '=', code.id)
      .execute();
    const jwt = await mintTestJwt({ sub: newId(), email: 'b@example.com' });
    const res = await request(ctx.app)
      .post('/invitations/redeem')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ code: code.code });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CODE_FULL');
  });

  it('401 without JWT', async () => {
    const res = await request(ctx.app).post('/invitations/redeem').send({ code: 'abcde' });
    expect(res.status).toBe(401);
  });

  it('400 on malformed code', async () => {
    const jwt = await mintTestJwt({ sub: newId(), email: 'x@example.com' });
    const res = await request(ctx.app)
      .post('/invitations/redeem')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ code: 'ZZ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
