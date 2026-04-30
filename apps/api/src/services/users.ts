// services/users.ts is NOT tenant-scoped — users span orgs by design (Option C
// identity model: one Supabase identity per email globally). However, role IS
// per-org (lives on user_orgs.role), so functions that need to return a role
// take orgId to look up the membership. The user record itself (display_name,
// email, avatar_url) is global to the identity.

import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';

import { sanitizeDisplayName } from '../middleware/auth.js';
import { ValidationError } from '../middleware/error.js';

export interface UpdateDisplayNameInput {
  userId: string;
  orgId: string;
  input: string;
}

export interface UserDto {
  id: string;
  email: string;
  display_name: string;
  role: 'member' | 'moderator' | 'super_user';
}

export async function updateDisplayName(
  db: Kysely<Database>,
  { userId, orgId, input }: UpdateDisplayNameInput,
): Promise<UserDto> {
  const cleaned = sanitizeDisplayName(input ?? '');
  if (cleaned.length === 0) {
    throw new ValidationError("Name can't be empty.");
  }

  const row = await db
    .updateTable('users')
    .set({ display_name: cleaned })
    .where('id', '=', userId)
    .returning(['id', 'email', 'display_name'])
    .executeTakeFirstOrThrow();

  const membership = await db
    .selectFrom('user_orgs')
    .where('user_id', '=', userId)
    .where('org_id', '=', orgId)
    .select('role')
    .executeTakeFirstOrThrow();

  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    role: membership.role,
  };
}
