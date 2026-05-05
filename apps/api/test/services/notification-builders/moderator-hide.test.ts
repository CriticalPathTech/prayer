import type { Database } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../../src/db/index.js';
import { moderatorHideBuilder } from '../../../src/services/notification-builders/moderator-hide.js';
import { insertComment, insertOrg, insertPost, insertUser } from '../../helpers/seed.js';

describe('moderatorHideBuilder', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'testchurch-nb-mod-hide' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('comments').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('writes one notification to the post author', async () => {
    const author = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'hidden' });
    await db.transaction().execute(async (trx) => {
      await moderatorHideBuilder(
        {
          id: newId(),
          org_id: orgId,
          type: 'moderator.hide',
          post_id: post.id,
          actor_id: null,
          payload: { target_type: 'post', target_id: post.id, source: 'auto' },
        },
        trx,
      );
    });
    const rows = await db.selectFrom('notifications').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(author.id);
    expect(rows[0]!.type).toBe('moderator.hide');
    expect((rows[0]!.payload as { source: string }).source).toBe('auto');
  });

  it('writes one notification to the comment author', async () => {
    const author = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const comment = await insertComment(db, {
      postId: post.id,
      authorId: author.id,
      orgId,
      participantId: author.id,
    });
    await db.transaction().execute(async (trx) => {
      await moderatorHideBuilder(
        {
          id: newId(),
          org_id: orgId,
          type: 'moderator.hide',
          post_id: post.id,
          actor_id: null,
          payload: { target_type: 'comment', target_id: comment.id, source: 'manual' },
        },
        trx,
      );
    });
    const rows = await db.selectFrom('notifications').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(author.id);
  });
});
