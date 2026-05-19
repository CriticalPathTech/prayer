import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { createLogger } from '../../src/lib/logger.js';
import { sweepPins } from '../../src/services/pin-job.js';
import { getTestchurchOrgId, insertPost, insertUser } from '../helpers/seed.js';

describe('sweepPins', () => {
  let db: Kysely<Database>;
  let orgId: string;
  let userId: string;

  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await getTestchurchOrgId(db);
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('posts').where('org_id', '=', orgId).execute();
    await db.deleteFrom('user_orgs').where('org_id', '=', orgId).execute();
    await db
      .deleteFrom('users')
      .where('id', '=', userId)
      .execute();
  });

  it('clears pin columns on rows where pin_until is in the past', async () => {
    const u = await insertUser(db, { orgId, role: 'moderator' });
    userId = u.id;
    const past = new Date(Date.now() - 60_000);
    const { id } = await insertPost(db, { authorId: userId, orgId, status: 'published' });
    await db
      .updateTable('posts')
      .set({ pinned_at: new Date(Date.now() - 86_400_000), pin_until: past, pinned_by: userId })
      .where('id', '=', id)
      .execute();

    const cleared = await sweepPins(db, { logger: createLogger('silent') });

    expect(cleared).toBe(1);
    const row = await db
      .selectFrom('posts')
      .select(['pinned_at', 'pin_until', 'pinned_by'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.pinned_at).toBeNull();
    expect(row.pin_until).toBeNull();
    expect(row.pinned_by).toBeNull();
  });

  it('leaves rows whose pin_until is in the future untouched', async () => {
    const u = await insertUser(db, { orgId, role: 'moderator' });
    userId = u.id;
    const future = new Date(Date.now() + 86_400_000);
    const { id } = await insertPost(db, { authorId: userId, orgId, status: 'published' });
    await db
      .updateTable('posts')
      .set({ pinned_at: new Date(), pin_until: future, pinned_by: userId })
      .where('id', '=', id)
      .execute();

    const cleared = await sweepPins(db, { logger: createLogger('silent') });

    expect(cleared).toBe(0);
    const row = await db
      .selectFrom('posts')
      .select(['pin_until'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.pin_until?.getTime()).toBe(future.getTime());
  });

  it('returns 0 when no pinned rows exist', async () => {
    userId = (await insertUser(db, { orgId })).id;
    expect(await sweepPins(db, { logger: createLogger('silent') })).toBe(0);
  });
});
