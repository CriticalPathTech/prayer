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

    // 2. Look up the code's org so we can both (a) scope the duplicate-redemption
    //    check by org and (b) decide where the new user_orgs membership lives.
    //    Without this scope, an existing member of org A would hit
    //    AlreadyRedeemedError when trying to redeem a code for org B.
    const codeRow = await trx
      .selectFrom('invite_codes')
      .where('code', '=', code)
      .select(['org_id', 'is_active', 'seats_remaining'])
      .executeTakeFirst();
    if (!codeRow) throw new CodeNotFoundError();
    if (!codeRow.is_active) throw new CodeInactiveError();

    // 3. Has this user already redeemed an invite for THIS org? Cross-org
    //    redemptions are allowed — a user can be a member of N orgs via N
    //    redemptions. Same-org dup is still blocked.
    const existing = await trx
      .selectFrom('invitations')
      .innerJoin('invite_codes as ic', 'ic.id', 'invitations.invite_code_id')
      .select(['invitations.id', 'ic.code as ic_code'])
      .where('invitee_id', '=', user.id)
      .where('invitations.org_id', '=', codeRow.org_id)
      .executeTakeFirst();

    //    A past redemption only blocks a new one while the user is STILL a
    //    member. `removeMember` drops the user_orgs row but deliberately keeps
    //    the ledger row for audit — so a removed member re-invited later has
    //    history but no membership, and must be allowed through. Gating on the
    //    ledger alone locked them out of every future invitation permanently.
    const membership = await trx
      .selectFrom('user_orgs as uo')
      .where('uo.user_id', '=', user.id)
      .where('uo.org_id', '=', codeRow.org_id)
      .select('role')
      .executeTakeFirst();

    if (existing && membership) {
      if (existing.ic_code === code) {
        // Idempotent re-redeem of the same code, same org — return success.
        return {
          user: {
            id: user.id,
            supabase_auth_id: user.supabase_auth_id,
            email: user.email,
            display_name: user.display_name,
            role: membership.role,
          },
        };
      }
      // Different code for the same org → still an "already redeemed" attempt.
      throw new AlreadyRedeemedError();
    }

    // 4. Atomic seat decrement. We already validated is_active above, so the
    //    only remaining failure is "no seats left."
    const claimed = await trx
      .updateTable('invite_codes')
      .set((eb) => ({ seats_remaining: eb('seats_remaining', '-', 1) }))
      .where('code', '=', code)
      .where('seats_remaining', '>', 0)
      .where('is_active', '=', true)
      .returning(['id', 'owner_id'])
      .executeTakeFirst();
    if (!claimed) {
      throw new CodeFullError();
    }

    const orgId = codeRow.org_id;

    // 5. Ensure the new member has a user_orgs row for this org.
    //    ON CONFLICT DO NOTHING is safe: if the row already exists (e.g. re-redeem
    //    of a different code path) the role is preserved.
    await trx
      .insertInto('user_orgs')
      .values({ user_id: user.id, org_id: orgId, role: 'member' })
      .onConflict((oc) => oc.columns(['user_id', 'org_id']).doNothing())
      .execute();

    // 6. Ledger row — scoped to the org
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

    // 7. Give the new member their own initial code, scoped to the same org.
    //    A re-joining member already owns a code here — removeMember zeroed its
    //    seats rather than deleting it — so refill that row instead of leaving a
    //    dead code behind alongside a fresh one.
    const ownCode = await trx
      .selectFrom('invite_codes')
      .select(['id', 'seat_cap'])
      .where('owner_id', '=', user.id)
      .where('org_id', '=', orgId)
      .orderBy('id', 'desc')
      .executeTakeFirst();
    if (ownCode) {
      await trx
        .updateTable('invite_codes')
        .set({ seats_remaining: ownCode.seat_cap, is_active: true })
        .where('id', '=', ownCode.id)
        .execute();
    } else {
      await mintInviteCode(trx, { ownerId: user.id, orgId, seatCap: 3 });
    }

    // 8. Outbox event
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
