import { createDb, newId } from '@prayer/db';
import { afterEach, describe, expect, it } from 'vitest';

import { ValidationError } from '../../src/middleware/error.js';
import { updateDisplayName } from '../../src/services/users.js';

const db = createDb(process.env.DATABASE_URL!);

async function insertOrg(): Promise<string> {
  const id = newId();
  await db
    .insertInto('orgs')
    .values({ id, slug: `org-${id.replace(/-/g, '')}`, display_name: 'Test Org' })
    .execute();
  return id;
}

async function insertUser(name: string, orgId: string): Promise<string> {
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
  await db.insertInto('user_orgs').values({ user_id: id, org_id: orgId, role: 'member' }).execute();
  return id;
}

afterEach(async () => {
  await db.deleteFrom('invitations').execute();
  await db.deleteFrom('invite_codes').execute();
  await db.deleteFrom('user_orgs').execute();
  await db.deleteFrom('users').execute();
  // Preserve the 'testchurch' fixture org seeded by global-setup (needed by orgContext
  // in concurrently-running route tests). Only clean up test-local orgs.
  await db.deleteFrom('orgs').where('slug', '!=', 'testchurch').execute();
});

describe('updateDisplayName', () => {
  it('updates the row and returns the new DTO', async () => {
    const orgId = await insertOrg();
    const id = await insertUser('Old', orgId);
    const out = await updateDisplayName(db, { userId: id, orgId, input: 'Ben K.' });
    expect(out.display_name).toBe('Ben K.');
    const row = await db
      .selectFrom('users')
      .select('display_name')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.display_name).toBe('Ben K.');
  });

  it('strips HTML-meaningful characters via sanitizeDisplayName', async () => {
    const orgId = await insertOrg();
    const id = await insertUser('Old', orgId);
    const out = await updateDisplayName(db, { userId: id, orgId, input: '<script>Ben</script>' });
    expect(out.display_name).toBe('scriptBenscript');
  });

  it('caps at 60 characters', async () => {
    const orgId = await insertOrg();
    const id = await insertUser('Old', orgId);
    const input = 'a'.repeat(120);
    const out = await updateDisplayName(db, { userId: id, orgId, input });
    expect(out.display_name).toHaveLength(60);
  });

  it('throws ValidationError when the sanitized result is empty', async () => {
    const orgId = await insertOrg();
    const id = await insertUser('Old', orgId);
    await expect(updateDisplayName(db, { userId: id, orgId, input: '<>' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('throws ValidationError when input is the empty string', async () => {
    const orgId = await insertOrg();
    const id = await insertUser('Old', orgId);
    await expect(updateDisplayName(db, { userId: id, orgId, input: '' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
