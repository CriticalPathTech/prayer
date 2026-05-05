import { createDb, newId } from '@prayer/db';
import { describe, it, expect, afterEach, beforeAll } from 'vitest';

import {
  generateInviteCode,
  mintInviteCode,
  previewInviteCode,
  retireInviteCode,
} from '../../src/services/invite-codes.js';
import { insertOrg } from '../helpers/seed.js';

const db = createDb(process.env.DATABASE_URL!);
let orgId: string;

beforeAll(async () => {
  orgId = await insertOrg(db, { slug: 'hopechurch-svc-invite-codes' });
});

async function insertUser(displayName: string) {
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

afterEach(async () => {
  await db.deleteFrom('invitations').execute();
  await db.deleteFrom('invite_codes').execute();
  await db.deleteFrom('user_orgs').execute();
  await db.deleteFrom('users').execute();
});

describe('generateInviteCode', () => {
  it('returns 5 lowercase alphanumeric chars', () => {
    for (let i = 0; i < 100; i++) {
      const c = generateInviteCode();
      expect(c).toMatch(/^[a-z0-9]{5}$/);
    }
  });
});

describe('mintInviteCode', () => {
  it('inserts a unique code with seats_remaining = seat_cap', async () => {
    const owner = await insertUser('Ben');
    const out = await mintInviteCode(db, { ownerId: owner, orgId, seatCap: 3 });
    expect(out.code).toMatch(/^[a-z0-9]{5}$/);
    expect(out.seat_cap).toBe(3);
    expect(out.seats_remaining).toBe(3);

    const row = await db
      .selectFrom('invite_codes')
      .selectAll()
      .where('id', '=', out.id)
      .executeTakeFirstOrThrow();
    expect(row.is_active).toBe(true);
  });
});

describe('previewInviteCode', () => {
  it('returns valid + invitor_display_name for an active code with seats', async () => {
    const owner = await insertUser('Ben');
    const minted = await mintInviteCode(db, { ownerId: owner, orgId, seatCap: 3 });
    const out = await previewInviteCode(db, { code: minted.code });
    expect(out).toEqual({
      status: 'valid',
      invitor_display_name: 'Ben',
      seat_cap: 3,
      seats_remaining: 3,
    });
  });

  it('returns not_found for unknown code', async () => {
    const out = await previewInviteCode(db, { code: 'zzzzz' });
    expect(out).toEqual({ status: 'not_found' });
  });

  it('returns full when seats_remaining = 0', async () => {
    const owner = await insertUser('Ben');
    const minted = await mintInviteCode(db, { ownerId: owner, orgId, seatCap: 1 });
    await db
      .updateTable('invite_codes')
      .set({ seats_remaining: 0 })
      .where('id', '=', minted.id)
      .execute();
    const out = await previewInviteCode(db, { code: minted.code });
    expect(out.status).toBe('full');
    expect(out).toMatchObject({ invitor_display_name: 'Ben', seat_cap: 1 });
  });

  it('returns inactive when is_active = false', async () => {
    const owner = await insertUser('Ben');
    const minted = await mintInviteCode(db, { ownerId: owner, orgId, seatCap: 3 });
    await retireInviteCode(db, { codeId: minted.id, orgId });
    const out = await previewInviteCode(db, { code: minted.code });
    expect(out.status).toBe('inactive');
  });

  it('normalizes uppercase input to lowercase', async () => {
    const owner = await insertUser('Ben');
    const minted = await mintInviteCode(db, { ownerId: owner, orgId, seatCap: 3 });
    const out = await previewInviteCode(db, { code: minted.code.toUpperCase() });
    expect(out.status).toBe('valid');
  });
});

describe('retireInviteCode', () => {
  it('sets is_active to false without touching seats_remaining', async () => {
    const owner = await insertUser('Ben');
    const minted = await mintInviteCode(db, { ownerId: owner, orgId, seatCap: 5 });
    await retireInviteCode(db, { codeId: minted.id, orgId });
    const row = await db
      .selectFrom('invite_codes')
      .selectAll()
      .where('id', '=', minted.id)
      .executeTakeFirstOrThrow();
    expect(row.is_active).toBe(false);
    expect(row.seats_remaining).toBe(5);
  });
});
