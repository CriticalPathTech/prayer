import type { Database, UserRole } from '@prayer/db';
import type { Kysely, Transaction } from 'kysely';

import {
  ForbiddenError,
  LastSuperUserError,
  NotFoundError,
  PendingPostsExistError,
  TooManySuperUsersError,
  ValidationError,
} from '../middleware/error.js';

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
  requiresPostApproval?: boolean;
}

export interface UpdateChurchSettingsResult {
  id: string;
  displayName: string;
  requiresPostApproval: boolean;
}

export async function updateChurchSettings(
  db: Kysely<Database>,
  input: UpdateChurchSettingsInput,
): Promise<UpdateChurchSettingsResult> {
  const displayName = sanitizeOrgName(input.displayName);
  if (displayName.length === 0) throw new ValidationError('displayName is required');
  if (displayName.length > 60)
    throw new ValidationError('displayName must be 60 characters or fewer');

  return db.transaction().execute(async (trx) => {
    const before = await trx
      .selectFrom('orgs')
      .select(['display_name', 'requires_post_approval'])
      .where('id', '=', input.orgId)
      .executeTakeFirstOrThrow();

    const nameUnchanged = before.display_name === displayName;
    const nextApproval = input.requiresPostApproval ?? before.requires_post_approval;
    const approvalUnchanged = before.requires_post_approval === nextApproval;

    if (nameUnchanged && approvalUnchanged) {
      return { id: input.orgId, displayName, requiresPostApproval: before.requires_post_approval };
    }

    if (before.requires_post_approval && !nextApproval) {
      const { count } = await trx
        .selectFrom('posts')
        .select(({ fn }) => fn.count<number>('id').as('count'))
        .where('org_id', '=', input.orgId)
        .where('status', '=', 'pending')
        .executeTakeFirstOrThrow();
      const n = Number(count);
      if (n > 0) throw new PendingPostsExistError(n);
    }

    await trx
      .updateTable('orgs')
      .set({
        display_name: displayName,
        requires_post_approval: nextApproval,
      })
      .where('id', '=', input.orgId)
      .execute();

    await writeAdminEvent(trx, {
      kind: 'admin.org_settings_updated',
      orgId: input.orgId,
      actorId: input.actorId,
      before: { displayName: before.display_name },
      after: { displayName },
    });

    return { id: input.orgId, displayName, requiresPostApproval: nextApproval };
  });
}

export interface ChurchSettings {
  displayName: string;
  requiresPostApproval: boolean;
}

/** Read-only snapshot of editable church-level fields. Bundled with the
 * members list so the UI can pre-fill the settings form without a second
 * round-trip. Reads from `orgs` directly (not via the orgContext cache) so
 * the value is always fresh — the cache TTL is a known staleness window. */
export async function getChurchSettings(
  db: Kysely<Database>,
  orgId: string,
): Promise<ChurchSettings> {
  const row = await db
    .selectFrom('orgs')
    .select(['display_name', 'requires_post_approval'])
    .where('id', '=', orgId)
    .executeTakeFirstOrThrow();
  return { displayName: row.display_name, requiresPostApproval: row.requires_post_approval };
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

/**
 * Count super_users in an org. Used by GET /admin/church/members for the
 * UI cap status, and by changeMemberRole for the cap/floor checks.
 */
export async function countSuperUsers(
  db: Kysely<Database> | Transaction<Database>,
  orgId: string,
): Promise<number> {
  const row = await db
    .selectFrom('user_orgs')
    .select(({ fn }) => fn.count<number>('user_id').as('count'))
    .where('org_id', '=', orgId)
    .where('role', '=', 'super_user')
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

export interface ChangeMemberRoleInput {
  actorId: string;
  targetUserId: string;
  orgId: string;
  newRole: UserRole;
}

export async function changeMemberRole(
  db: Kysely<Database>,
  input: ChangeMemberRoleInput,
): Promise<void> {
  if (input.actorId === input.targetUserId) {
    throw new ForbiddenError('cannot change your own role');
  }

  await db.transaction().execute(async (trx) => {
    const target = await trx
      .selectFrom('user_orgs')
      .where('user_id', '=', input.targetUserId)
      .where('org_id', '=', input.orgId)
      .select(['role'])
      .executeTakeFirst();
    if (!target) throw new NotFoundError();

    const currentRole = target.role as UserRole;
    if (currentRole === input.newRole) return; // no-op short-circuit; no event

    // Both cap and floor checks need the current super_user count.
    const count = await countSuperUsers(trx, input.orgId);

    // Cap: promoting a non-super_user into super_user when already at 3.
    if (input.newRole === 'super_user' && currentRole !== 'super_user' && count >= 3) {
      throw new TooManySuperUsersError();
    }
    // Floor: demoting the only super_user.
    if (currentRole === 'super_user' && input.newRole !== 'super_user' && count <= 1) {
      throw new LastSuperUserError();
    }

    await trx
      .updateTable('user_orgs')
      .set({ role: input.newRole })
      .where('user_id', '=', input.targetUserId)
      .where('org_id', '=', input.orgId)
      .execute();

    await writeAdminEvent(trx, {
      kind: 'admin.role_changed',
      orgId: input.orgId,
      actorId: input.actorId,
      targetUserId: input.targetUserId,
      beforeRole: currentRole,
      afterRole: input.newRole,
    });
  });
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
