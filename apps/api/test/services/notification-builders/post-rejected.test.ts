import { describe, it, expect, beforeEach, afterAll } from 'vitest';

import { initDb } from '../../../src/db/index.js';
import { postRejectedBuilder } from '../../../src/services/notification-builders/post-rejected.js';
import { getTestchurchOrgId, insertPost, insertUser } from '../../helpers/seed.js';

const cleanupDb = initDb(process.env.TEST_DATABASE_URL!);
afterAll(async () => {
  await cleanupDb.deleteFrom('events').execute();
  await cleanupDb.deleteFrom('posts').execute();
  await cleanupDb.deleteFrom('notifications').execute();
});

describe('postRejectedBuilder', () => {
  const db = initDb(process.env.TEST_DATABASE_URL!);

  beforeEach(async () => {
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('posts').execute();
  });

  it('writes one notification row to the post author with note + body_preview', async () => {
    const orgId = await getTestchurchOrgId(db);
    const author = await insertUser(db, { orgId, role: 'member' });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const p = await insertPost(db, { authorId: author.id, orgId, status: 'rejected', body: 'a request' });

    await db.transaction().execute(async (trx) => {
      await postRejectedBuilder(
        {
          id: 'evt-1', org_id: orgId, type: 'post.rejected',
          post_id: p.id, actor_id: mod.id,
          payload: { moderation_note: 'please reword', moderated_by: mod.id, body_preview: 'a request' },
        },
        trx,
      );
    });
    const rows = await db.selectFrom('notifications').selectAll().where('user_id', '=', author.id).execute();
    expect(rows.length).toBe(1);
    expect(rows[0]!.type).toBe('post.rejected');
    const payload = rows[0]!.payload as { moderation_note?: string; body_preview?: string };
    expect(payload.moderation_note).toBe('please reword');
    expect(payload.body_preview).toBe('a request');
  });
});
