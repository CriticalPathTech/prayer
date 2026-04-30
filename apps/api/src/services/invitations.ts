import type { Database } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';

import { sanitizeDisplayName } from '../middleware/auth.js';
import {
  AlreadyRedeemedError,
  CodeFullError,
  CodeInactiveError,
  CodeNotFoundError,
} from '../middleware/error.js';

import { writeInvitationEvent } from './events.js';
import { mintInviteCode } from './invite-codes.js';

export interface RedeemInvitationInput {
  supabaseAuthId: string;
  email: string;
  code: string;
}

export interface RedeemInvitationResult {
  user: {
    id: string;
    supabase_auth_id: string;
    email: string;
    display_name: string;
    role: 'member' | 'moderator' | 'super_user';
  };
}

export async function redeemInvitation(
  db: Kysely<Database>,
  input: RedeemInvitationInput,
): Promise<RedeemInvitationResult> {
  const code = input.code.trim().toLowerCase();

  return db.transaction().execute(async (trx) => {
    // 1. Upsert user row. ON CONFLICT (supabase_auth_id) DO NOTHING returns nothing
    //    if the user already exists; otherwise returns the freshly inserted row.
    const inserted = await trx
      .insertInto('users')
      .values({
        id: newId(),
        supabase_auth_id: input.supabaseAuthId,
        email: input.email,
        display_name: sanitizeDisplayName(input.email),
      })
      .onConflict((oc) => oc.column('supabase_auth_id').doNothing())
      .returningAll()
      .executeTakeFirst();

    const user =
      inserted ??
      (await trx
        .selectFrom('users')
        .selectAll()
        .where('supabase_auth_id', '=', input.supabaseAuthId)
        .executeTakeFirstOrThrow());

    // 2. If the caller is already-redeemed, bail. Detect by existence of any
    //    invitations row for them. Idempotent only if they're re-redeeming the
    //    same code; otherwise it's an attempt to jump codes.
    const existing = await trx
      .selectFrom('invitations')
      .innerJoin('invite_codes as ic', 'ic.id', 'invitations.invite_code_id')
      .select(['invitations.id', 'invitations.invite_code_id', 'ic.code as ic_code', 'ic.org_id'])
      .where('invitee_id', '=', user.id)
      .executeTakeFirst();
    if (existing) {
      if (existing.ic_code === code) {
        // Idempotent re-redeem: look up role from user_orgs for this org
        const uo = await trx
          .selectFrom('user_orgs as uo')
          .where('uo.user_id', '=', user.id)
          .where('uo.org_id', '=', existing.org_id)
          .select('role')
          .executeTakeFirst();
        return {
          user: {
            id: user.id,
            supabase_auth_id: user.supabase_auth_id,
            email: user.email,
            display_name: user.display_name,
            role: uo?.role ?? 'member',
          },
        };
      }
      throw new AlreadyRedeemedError();
    }

    // 3. Atomic seat decrement. Returns nothing if code missing / full / inactive.
    //    Also fetch org_id so all subsequent writes are scoped to the correct org.
    const claimed = await trx
      .updateTable('invite_codes')
      .set((eb) => ({ seats_remaining: eb('seats_remaining', '-', 1) }))
      .where('code', '=', code)
      .where('seats_remaining', '>', 0)
      .where('is_active', '=', true)
      .returning(['id', 'owner_id', 'org_id'])
      .executeTakeFirst();

    if (!claimed) {
      // Classify: is it missing, full, or inactive?
      const row = await trx
        .selectFrom('invite_codes')
        .select(['seats_remaining', 'is_active'])
        .where('code', '=', code)
        .executeTakeFirst();
      if (!row) throw new CodeNotFoundError();
      if (!row.is_active) throw new CodeInactiveError();
      throw new CodeFullError();
    }

    const orgId = claimed.org_id;

    // 4. Ensure the new member has a user_orgs row for this org.
    //    ON CONFLICT DO NOTHING is safe: if the row already exists (e.g. re-redeem
    //    of a different code path) the role is preserved.
    await trx
      .insertInto('user_orgs')
      .values({ user_id: user.id, org_id: orgId, role: 'member' })
      .onConflict((oc) => oc.columns(['user_id', 'org_id']).doNothing())
      .execute();

    // 5. Ledger row — scoped to the org
    const invitationId = newId();
    await trx
      .insertInto('invitations')
      .values({
        id: invitationId,
        org_id: orgId,
        invite_code_id: claimed.id,
        invitor_id: claimed.owner_id,
        invitee_id: user.id,
      })
      .execute();

    // 6. Mint the new member's own initial code, scoped to the same org
    await mintInviteCode(trx, { ownerId: user.id, orgId, seatCap: 3 });

    // 7. Outbox event
    await writeInvitationEvent(trx, {
      kind: 'invitation.redeemed',
      orgId,
      actorId: claimed.owner_id,
      invitationId,
      invitorId: claimed.owner_id,
      inviteeId: user.id,
      inviteCodeId: claimed.id,
      inviteeDisplayName: user.display_name,
    });

    return {
      user: {
        id: user.id,
        supabase_auth_id: user.supabase_auth_id,
        email: user.email,
        display_name: user.display_name,
        role: 'member',
      },
    };
  });
}
