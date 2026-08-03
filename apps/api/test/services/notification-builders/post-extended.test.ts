import { describe, it, expect, beforeEach, afterAll } from 'vitest';

import { initDb } from '../../../src/db/index.js';
import { postExtendedBuilder } from '../../../src/services/notification-builders/post-extended.js';
import { getTestchurchOrgId, insertPost, insertUser } from '../../helpers/seed.js';

const cleanupDb = initDb(process.env.TEST_DATABASE_URL!);
afterAll(async () => {
  await cleanupDb.deleteFrom('events').execute();
  await cleanupDb.deleteFrom('posts').execute();
  await cleanupDb.deleteFrom('notifications').execute();
});

describe('postExtendedBuilder', () => {
  const db = initDb(process.env.TEST_DATABASE_URL!);

  beforeEach(async () => {
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('posts').execute();
  });

  it('writes a notification to the post author with duration + new_expires_at', async () => {
    const orgId = await getTestchurchOrgId(db);
    const author = await insertUser(db, { orgId, role: 'member' });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const p = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const newExpiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();

    await db.transaction().execute(async (trx) => {
      await postExtendedBuilder(
        {
          id: 'evt-ext-1',
          org_id: orgId,
          type: 'post.extended',
          post_id: p.id,
          actor_id: mod.id,
          payload: {
            old_expires_at: new Date().toISOString(),
            new_expires_at: newExpiresAt,
            duration_days: 14,
            was_archived: false,
            extended_by: mod.id,
          },
        },
        trx,
      );
    });

    const rows = await db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', author.id)
      .execute();
    expect(rows.length).toBe(1);
    expect(rows[0]!.type).toBe('post.extended');
    const payload = rows[0]!.payload as {
      duration_days?: number;
      new_expires_at?: string;
      was_archived?: boolean;
    };
    expect(payload.duration_days).toBe(14);
    expect(payload.new_expires_at).toBe(newExpiresAt);
    expect(payload.was_archived).toBe(false);
  });

  it('does not notify when the moderator is also the author', async () => {
    const orgId = await getTestchurchOrgId(db);
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const p = await insertPost(db, { authorId: mod.id, orgId, status: 'published' });

    await db.transaction().execute(async (trx) => {
      await postExtendedBuilder(
        {
          id: 'evt-ext-2',
          org_id: orgId,
          type: 'post.extended',
          post_id: p.id,
          actor_id: mod.id,
          payload: {
            old_expires_at: null,
            new_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
            duration_days: 7,
            was_archived: false,
            extended_by: mod.id,
          },
        },
        trx,
      );
    });

    const rows = await db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', mod.id)
      .execute();
    expect(rows.length).toBe(0);
  });
});
