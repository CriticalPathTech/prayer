import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';

import { ForbiddenError, NotFoundError, ValidationError } from '../middleware/error.js';

import { writeAdminEvent } from './events.js';

export interface RemoveMemberInput {
  actorId: string;
  targetUserId: string;
  orgId: string;
}

// Sanitize an org display name: trim, strip control + HTML-meaningful chars.
// Looser than user displayName (allows ampersands, parens, slashes — common in
// church names like "St. John's & Mary's"), but still defensive against XSS.
function sanitizeOrgName(raw: string): string {
  return (
    (raw ?? '')
      .replace(/[<>&]/g, '') // strip HTML-meaningful chars
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1F\x7F]/g, '') // strip control chars
      .trim()
  );
}

export interface UpdateChurchSettingsInput {
  orgId: string;
  actorId: string;
  displayName: string;
}

export interface UpdateChurchSettingsResult {
  id: string;
  displayName: string;
}

export async function updateChurchSettings(
  db: Kysely<Database>,
  input: UpdateChurchSettingsInput,
): Promise<UpdateChurchSettingsResult> {
  const displayName = sanitizeOrgName(input.displayName);
  if (displayName.length === 0) {
    throw new ValidationError('displayName is required');
  }
  if (displayName.length > 60) {
    throw new ValidationError('displayName must be 60 characters or fewer');
  }

  const before = await db
    .selectFrom('orgs')
    .select('display_name')
    .where('id', '=', input.orgId)
    .executeTakeFirstOrThrow();

  if (before.display_name === displayName) {
    return { id: input.orgId, displayName };
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('orgs')
      .set({ display_name: displayName })
      .where('id', '=', input.orgId)
      .execute();
    await writeAdminEvent(trx, {
      kind: 'admin.org_settings_updated',
      orgId: input.orgId,
      actorId: input.actorId,
      before: { displayName: before.display_name },
      after: { displayName },
    });
  });

  return { id: input.orgId, displayName };
}

export interface MemberRow {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  role: 'member' | 'moderator' | 'super_user';
  joinedAt: string;
}

export async function listMembers(db: Kysely<Database>, orgId: string): Promise<MemberRow[]> {
  const rows = await db
    .selectFrom('users as u')
    .innerJoin('user_orgs as uo', 'uo.user_id', 'u.id')
    .where('uo.org_id', '=', orgId)
    .select([
      'u.id as id',
      'u.display_name as displayName',
      'u.email as email',
      'u.avatar_url as avatarUrl',
      'uo.role as role',
      'uo.joined_at as joinedAt',
    ])
    .orderBy('uo.joined_at', 'asc')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    email: r.email,
    avatarUrl: r.avatarUrl,
    role: r.role as MemberRow['role'],
    joinedAt: (r.joinedAt as unknown as Date).toISOString(),
  }));
}

export async function removeMember(db: Kysely<Database>, input: RemoveMemberInput): Promise<void> {
  if (input.actorId === input.targetUserId) {
    throw new ForbiddenError('cannot remove yourself from the church');
  }

  await db.transaction().execute(async (trx) => {
    const deleted = await trx
      .deleteFrom('user_orgs')
      .where('user_id', '=', input.targetUserId)
      .where('org_id', '=', input.orgId)
      .returning('user_id')
      .executeTakeFirst();
    if (!deleted) {
      throw new NotFoundError();
    }

    // Zero the seats — leaves is_active true, leaves the row in place for
    // audit, blocks new redemptions with a CodeFullError (softer wording than
    // CodeInactiveError). Past redemptions are untouched.
    await trx
      .updateTable('invite_codes')
      .set({ seats_remaining: 0 })
      .where('owner_id', '=', input.targetUserId)
      .where('org_id', '=', input.orgId)
      .execute();

    await writeAdminEvent(trx, {
      kind: 'admin.member_removed',
      orgId: input.orgId,
      actorId: input.actorId,
      targetUserId: input.targetUserId,
    });
  });
}
