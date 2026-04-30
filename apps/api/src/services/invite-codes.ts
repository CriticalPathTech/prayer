import { generateInviteCode, mintInviteCode } from '@prayer/db';
import type { Database, MintedCode } from '@prayer/db';
import type { Kysely } from 'kysely';

export { generateInviteCode, mintInviteCode };
export type { MintedCode };

function normalizeCode(raw: string): string {
  return raw.trim().toLowerCase();
}

export type PreviewInviteCodeResult =
  | {
      status: 'valid';
      invitor_display_name: string;
      seat_cap: number;
      seats_remaining: number;
    }
  | { status: 'full'; invitor_display_name: string; seat_cap: number }
  | { status: 'inactive'; invitor_display_name: string; seat_cap: number }
  | { status: 'not_found' };

export async function previewInviteCode(
  db: Kysely<Database>,
  input: { code: string },
): Promise<PreviewInviteCodeResult> {
  const code = normalizeCode(input.code);
  const row = await db
    .selectFrom('invite_codes')
    .innerJoin('users', 'users.id', 'invite_codes.owner_id')
    .select([
      'invite_codes.seat_cap',
      'invite_codes.seats_remaining',
      'invite_codes.is_active',
      'users.display_name as invitor_display_name',
    ])
    .where('invite_codes.code', '=', code)
    .executeTakeFirst();
  if (!row) return { status: 'not_found' };
  if (!row.is_active) {
    return {
      status: 'inactive',
      invitor_display_name: row.invitor_display_name,
      seat_cap: row.seat_cap,
    };
  }
  if (row.seats_remaining === 0) {
    return {
      status: 'full',
      invitor_display_name: row.invitor_display_name,
      seat_cap: row.seat_cap,
    };
  }
  return {
    status: 'valid',
    invitor_display_name: row.invitor_display_name,
    seat_cap: row.seat_cap,
    seats_remaining: row.seats_remaining,
  };
}

export async function retireInviteCode(
  db: Kysely<Database>,
  input: { codeId: string; orgId: string },
): Promise<void> {
  await db
    .updateTable('invite_codes')
    .set({ is_active: false })
    .where('id', '=', input.codeId)
    .where('org_id', '=', input.orgId)
    .execute();
}

export interface InviteCodeWithRedemptions {
  id: string;
  code: string;
  seat_cap: number;
  seats_remaining: number;
  is_active: boolean;
  created_at: Date;
  redemptions: Array<{ invitee_id: string; invitee_display_name: string; redeemed_at: Date }>;
}

export async function listInviteCodesForOwner(
  db: Kysely<Database>,
  input: { ownerId: string; orgId: string },
): Promise<InviteCodeWithRedemptions[]> {
  const codes = await db
    .selectFrom('invite_codes')
    .selectAll()
    .where('owner_id', '=', input.ownerId)
    .where('org_id', '=', input.orgId)
    .orderBy('created_at', 'desc')
    .execute();
  if (codes.length === 0) return [];

  const ids = codes.map((c) => c.id);
  const redemptions = await db
    .selectFrom('invitations')
    .innerJoin('users as invitee', 'invitee.id', 'invitations.invitee_id')
    .select([
      'invitations.invite_code_id',
      'invitations.invitee_id',
      'invitations.created_at as redeemed_at',
      'invitee.display_name as invitee_display_name',
    ])
    .where('invitations.invite_code_id', 'in', ids)
    .orderBy('invitations.created_at', 'asc')
    .execute();

  const byCode = new Map<string, typeof redemptions>();
  for (const r of redemptions) {
    const bucket = byCode.get(r.invite_code_id) ?? [];
    bucket.push(r);
    byCode.set(r.invite_code_id, bucket);
  }

  return codes.map((c) => ({
    id: c.id,
    code: c.code,
    seat_cap: c.seat_cap,
    seats_remaining: c.seats_remaining,
    is_active: c.is_active,
    created_at: c.created_at as unknown as Date,
    redemptions: (byCode.get(c.id) ?? []).map((r) => ({
      invitee_id: r.invitee_id,
      invitee_display_name: r.invitee_display_name,
      redeemed_at: r.redeemed_at as unknown as Date,
    })),
  }));
}
