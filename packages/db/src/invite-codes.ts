import crypto from 'node:crypto';

import type { Kysely, Transaction } from 'kysely';

import { newId } from './ids.js';
import type { Database } from './schema.js';

const CODE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const MAX_GENERATE_ATTEMPTS = 10;

export function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }
  return out;
}

export interface MintedCode {
  id: string;
  code: string;
  seat_cap: number;
  seats_remaining: number;
}

export interface MintInviteCodeArgs {
  ownerId: string;
  orgId: string;
  seatCap: number;
}

export async function mintInviteCode(
  db: Kysely<Database> | Transaction<Database>,
  input: MintInviteCodeArgs,
): Promise<MintedCode> {
  for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
    const id = newId();
    const code = generateInviteCode();
    try {
      await db
        .insertInto('invite_codes')
        .values({
          id,
          org_id: input.orgId,
          owner_id: input.ownerId,
          code,
          seat_cap: input.seatCap,
          seats_remaining: input.seatCap,
        })
        .execute();
      return { id, code, seat_cap: input.seatCap, seats_remaining: input.seatCap };
    } catch (err) {
      const pgCode = (err as { code?: string } | null)?.code;
      if (pgCode !== '23505') throw err;
    }
  }
  throw new Error('Failed to generate unique invite code after 10 attempts');
}
