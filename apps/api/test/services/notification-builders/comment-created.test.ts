import type { Database } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../../src/db/index.js';
import { commentCreatedBuilder } from '../../../src/services/notification-builders/comment-created.js';
import { insertPost, insertUser } from '../../helpers/seed.js';

describe('commentCreatedBuilder', () => {
  let db: Kysely<Database>;
  beforeAll(() => {
    db = initDb(process.env.TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('comments').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('users').execute();
  });

  it('writes one notification row for the post author', async () => {
    const author = await insertUser(db);
    const commenter = await insertUser(db);
    const post = await insertPost(db, { authorId: author.id, status: 'published' });
    const commentId = newId();
    await db.transaction().execute(async (trx) => {
      await commentCreatedBuilder(
        {
          id: newId(),
          type: 'comment.created',
          post_id: post.id,
          actor_id: commenter.id,
          payload: {
            comment_id: commentId,
            post_id: post.id,
            post_author_id: author.id,
            commenter_id: commenter.id,
            commenter_display_name: 'Bob',
            preview: 'Praying for you',
          },
        },
        trx,
      );
    });
    const rows = await db.selectFrom('notifications').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(author.id);
    expect(rows[0]!.type).toBe('comment.created');
  });

  it('skips self-notification when the commenter IS the post author', async () => {
    const user = await insertUser(db);
    const post = await insertPost(db, { authorId: user.id, status: 'published' });
    const commentId = newId();
    await db.transaction().execute(async (trx) => {
      await commentCreatedBuilder(
        {
          id: newId(),
          type: 'comment.created',
          post_id: post.id,
          actor_id: user.id,
          payload: {
            comment_id: commentId,
            post_id: post.id,
            post_author_id: user.id,
            commenter_id: user.id,
            commenter_display_name: 'Self',
            preview: 'self-comment',
          },
        },
        trx,
      );
    });
    const rows = await db.selectFrom('notifications').selectAll().execute();
    expect(rows).toHaveLength(0);
  });
});
