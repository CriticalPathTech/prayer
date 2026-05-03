import { createDb, newId } from '@prayer/db';
import { afterEach, describe, expect, it } from 'vitest';

import { ValidationError } from '../../src/middleware/error.js';
import { updateDisplayName } from '../../src/services/users.js';

const db = createDb(process.env.DATABASE_URL!);

async function insertUser(name: string): Promise<string> {
  const id = newId();
  await db
    .insertInto('users')
    .values({
      id,
      supabase_auth_id: newId(),
      email: `${id}@example.com`,
      display_name: name,
    })
    .execute();
  return id;
}

afterEach(async () => {
  await db.deleteFrom('invitations').execute();
  await db.deleteFrom('invite_codes').execute();
  await db.deleteFrom('users').execute();
});

describe('updateDisplayName', () => {
  it('updates the row and returns the new DTO', async () => {
    const id = await insertUser('Old');
    const out = await updateDisplayName(db, { userId: id, input: 'Ben K.' });
    expect(out.display_name).toBe('Ben K.');
    const row = await db
      .selectFrom('users')
      .select('display_name')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.display_name).toBe('Ben K.');
  });

  it('strips HTML-meaningful characters via sanitizeDisplayName', async () => {
    const id = await insertUser('Old');
    const out = await updateDisplayName(db, { userId: id, input: '<script>Ben</script>' });
    expect(out.display_name).toBe('scriptBenscript');
  });

  it('caps at 60 characters', async () => {
    const id = await insertUser('Old');
    const input = 'a'.repeat(120);
    const out = await updateDisplayName(db, { userId: id, input });
    expect(out.display_name).toHaveLength(60);
  });

  it('throws ValidationError when the sanitized result is empty', async () => {
    const id = await insertUser('Old');
    await expect(updateDisplayName(db, { userId: id, input: '<>' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('throws ValidationError when input is the empty string', async () => {
    const id = await insertUser('Old');
    await expect(updateDisplayName(db, { userId: id, input: '' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
