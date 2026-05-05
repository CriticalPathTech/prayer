import type { Database } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { reactionCountRecomputer } from '../../src/services/reaction-consumer.js';
import { insertComment, insertOrg, insertPost, insertUser } from '../helpers/seed.js';

describe('reactionCountRecomputer', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'testchurch-svc-reaction-consumer' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('reactions').execute();
    await db.deleteFrom('comments').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('recomputes posts.reaction_count via COUNT(*) on post target', async () => {
    const u1 = await insertUser(db, { orgId });
    const u2 = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: u1.id, orgId, status: 'published' });
    await db
      .insertInto('reactions')
      .values([
        {
          id: newId(),
          org_id: orgId,
          target_type: 'post',
          target_id: post.id,
          author_id: u1.id,
          emoji: '🙏',
        },
        {
          id: newId(),
          org_id: orgId,
          target_type: 'post',
          target_id: post.id,
          author_id: u2.id,
          emoji: '❤️',
        },
      ])
      .execute();

    await db.transaction().execute(async (trx) => {
      await reactionCountRecomputer(
        {
          id: newId(),
          org_id: orgId,
          type: 'reaction.added',
          post_id: post.id,
          actor_id: u1.id,
          payload: { target_type: 'post', target_id: post.id, emoji: '🙏' },
        },
        trx,
      );
    });

    const row = await db
      .selectFrom('posts')
      .select('reaction_count')
      .where('id', '=', post.id)
      .executeTakeFirstOrThrow();
    expect(row.reaction_count).toBe(2);
  });

  it('recomputes comments.reaction_count and does NOT touch posts.reaction_count', async () => {
    const u1 = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: u1.id, orgId, status: 'published' });
    const comment = await insertComment(db, {
      postId: post.id,
      authorId: u1.id,
      orgId,
      participantId: u1.id,
    });
    await db
      .insertInto('reactions')
      .values({
        id: newId(),
        org_id: orgId,
        target_type: 'comment',
        target_id: comment.id,
        author_id: u1.id,
        emoji: '🙌',
      })
      .execute();

    await db.transaction().execute(async (trx) => {
      await reactionCountRecomputer(
        {
          id: newId(),
          org_id: orgId,
          type: 'reaction.added',
          post_id: post.id,
          actor_id: u1.id,
          payload: { target_type: 'comment', target_id: comment.id, emoji: '🙌' },
        },
        trx,
      );
    });

    const c = await db
      .selectFrom('comments')
      .select('reaction_count')
      .where('id', '=', comment.id)
      .executeTakeFirstOrThrow();
    const p = await db
      .selectFrom('posts')
      .select('reaction_count')
      .where('id', '=', post.id)
      .executeTakeFirstOrThrow();
    expect(c.reaction_count).toBe(1);
    expect(p.reaction_count).toBe(0);
  });

  it('is idempotent — running twice leaves count correct', async () => {
    const u1 = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: u1.id, orgId, status: 'published' });
    await db
      .insertInto('reactions')
      .values({
        id: newId(),
        org_id: orgId,
        target_type: 'post',
        target_id: post.id,
        author_id: u1.id,
        emoji: '🙏',
      })
      .execute();

    for (let i = 0; i < 2; i++) {
      await db.transaction().execute(async (trx) => {
        await reactionCountRecomputer(
          {
            id: newId(),
            org_id: orgId,
            type: 'reaction.added',
            post_id: post.id,
            actor_id: u1.id,
            payload: { target_type: 'post', target_id: post.id, emoji: '🙏' },
          },
          trx,
        );
      });
    }
    const row = await db
      .selectFrom('posts')
      .select('reaction_count')
      .where('id', '=', post.id)
      .executeTakeFirstOrThrow();
    expect(row.reaction_count).toBe(1);
  });
});
