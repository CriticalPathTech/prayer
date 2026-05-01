import { createDb, newId } from '@prayer/db';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest';

import {
  AlreadyRedeemedError,
  CodeInactiveError,
  CodeNotFoundError,
} from '../../src/middleware/error.js';
import { redeemInvitation } from '../../src/services/invitations.js';
import { mintInviteCode } from '../../src/services/invite-codes.js';
import { mintTestJwt } from '../helpers/jwt.js';
import { insertOrg, insertUser } from '../helpers/seed.js';
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

describe('redeemInvitation — multi-org', () => {
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    orgA = await insertOrg(db, { slug: `multi-a-${newId().slice(0, 8)}` });
    orgB = await insertOrg(db, { slug: `multi-b-${newId().slice(0, 8)}` });
  });

  afterEach(async () => {
    await db.deleteFrom('invitations').execute();
    await db.deleteFrom('invite_codes').execute();
    await db.deleteFrom('events').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  afterAll(async () => {
    await db.deleteFrom('orgs').where('id', 'in', [orgA, orgB]).execute();
  });

  it('existing user from org A can redeem a code for org B', async () => {
    const ownerA = await insertUser(db, { email: 'owner-a@multi.com', orgId: orgA });
    const ownerB = await insertUser(db, { email: 'owner-b@multi.com', orgId: orgB });
    const userA = await insertUser(db, { email: 'joiner@multi.com', orgId: orgA });

    // userA redeems orgA code first (sets up the prior-redemption row)
    const codeA = await mintInviteCode(db, { ownerId: ownerA.id, orgId: orgA, seatCap: 5 });
    await redeemInvitation(db, {
      supabaseAuthId: userA.supabaseAuthId,
      email: userA.email,
      code: codeA.code,
    });

    // Now redeem an orgB code with the SAME user — should succeed (the bug fix)
    const codeB = await mintInviteCode(db, { ownerId: ownerB.id, orgId: orgB, seatCap: 5 });
    const result = await redeemInvitation(db, {
      supabaseAuthId: userA.supabaseAuthId,
      email: userA.email,
      code: codeB.code,
    });
    expect(result.user.id).toBe(userA.id);

    // Verify user_orgs has rows for both orgs
    const memberships = await db
      .selectFrom('user_orgs')
      .where('user_id', '=', userA.id)
      .select('org_id')
      .execute();
    const orgIds = memberships.map((m) => m.org_id).sort();
    expect(orgIds).toEqual([orgA, orgB].sort());

    // Verify invitations table has 2 rows (one per org)
    const invites = await db
      .selectFrom('invitations')
      .where('invitee_id', '=', userA.id)
      .select('org_id')
      .execute();
    expect(invites).toHaveLength(2);
  });

  it('rejects a different code for the same org with AlreadyRedeemedError', async () => {
    const owner = await insertUser(db, { email: 'owner-dup@multi.com', orgId: orgA });
    const userA = await insertUser(db, { email: 'joiner-dup@multi.com', orgId: orgA });

    const code1 = await mintInviteCode(db, { ownerId: owner.id, orgId: orgA, seatCap: 5 });
    const code2 = await mintInviteCode(db, { ownerId: owner.id, orgId: orgA, seatCap: 5 });

    await redeemInvitation(db, {
      supabaseAuthId: userA.supabaseAuthId,
      email: userA.email,
      code: code1.code,
    });

    await expect(
      redeemInvitation(db, {
        supabaseAuthId: userA.supabaseAuthId,
        email: userA.email,
        code: code2.code,
      }),
    ).rejects.toBeInstanceOf(AlreadyRedeemedError);
  });

  it('rejects a code for org A when user is already in orgs A and B (still blocks dup-A)', async () => {
    const ownerA = await insertUser(db, { email: 'owner-tri-a@multi.com', orgId: orgA });
    const ownerB = await insertUser(db, { email: 'owner-tri-b@multi.com', orgId: orgB });
    const userA = await insertUser(db, { email: 'joiner-tri@multi.com', orgId: orgA });

    const codeA1 = await mintInviteCode(db, { ownerId: ownerA.id, orgId: orgA, seatCap: 5 });
    await redeemInvitation(db, {
      supabaseAuthId: userA.supabaseAuthId,
      email: userA.email,
      code: codeA1.code,
    });

    const codeB = await mintInviteCode(db, { ownerId: ownerB.id, orgId: orgB, seatCap: 5 });
    await redeemInvitation(db, {
      supabaseAuthId: userA.supabaseAuthId,
      email: userA.email,
      code: codeB.code,
    });

    // Now try to redeem ANOTHER code for orgA — should fail
    const codeA2 = await mintInviteCode(db, { ownerId: ownerA.id, orgId: orgA, seatCap: 5 });
    await expect(
      redeemInvitation(db, {
        supabaseAuthId: userA.supabaseAuthId,
        email: userA.email,
        code: codeA2.code,
      }),
    ).rejects.toBeInstanceOf(AlreadyRedeemedError);
  });

  it('CodeNotFoundError fires before any other validation', async () => {
    await expect(
      redeemInvitation(db, {
        supabaseAuthId: newId(),
        email: 'never@multi.com',
        code: 'doesnotexistcode',
      }),
    ).rejects.toBeInstanceOf(CodeNotFoundError);
  });

  it('CodeInactiveError fires before the dup check', async () => {
    const owner = await insertUser(db, { email: 'owner-inactive@multi.com', orgId: orgA });
    const userA = await insertUser(db, { email: 'joiner-inactive@multi.com', orgId: orgA });

    const code = await mintInviteCode(db, { ownerId: owner.id, orgId: orgA, seatCap: 5 });
    await db
      .updateTable('invite_codes')
      .set({ is_active: false })
      .where('id', '=', code.id)
      .execute();

    await expect(
      redeemInvitation(db, {
        supabaseAuthId: userA.supabaseAuthId,
        email: userA.email,
        code: code.code,
      }),
    ).rejects.toBeInstanceOf(CodeInactiveError);
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
