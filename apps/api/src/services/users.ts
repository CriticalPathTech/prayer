import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';

import { sanitizeDisplayName } from '../middleware/auth.js';
import { ValidationError } from '../middleware/error.js';

export interface UpdateDisplayNameInput {
  userId: string;
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
  { userId, input }: UpdateDisplayNameInput,
): Promise<UserDto> {
  const cleaned = sanitizeDisplayName(input ?? '');
  if (cleaned.length === 0) {
    throw new ValidationError("Name can't be empty.");
  }

  const row = await db
    .updateTable('users')
    .set({ display_name: cleaned })
    .where('id', '=', userId)
    .returning(['id', 'email', 'display_name', 'role'])
    .executeTakeFirstOrThrow();

  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    role: row.role,
  };
}
