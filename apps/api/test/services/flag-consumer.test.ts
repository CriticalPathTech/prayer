import type { Database } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { flagConsumer } from '../../src/services/flag-consumer.js';
import { insertComment, insertOrg, insertPost, insertUser } from '../helpers/seed.js';

describe('flagConsumer', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'testchurch-svc-flag-consumer' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('flags').execute();
    await db.deleteFrom('comments').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('recomputes posts.flag_count via COUNT(*) over open flags + auto-hides at 2 + emits moderator.hide auto', async () => {
    const author = await insertUser(db, { orgId });
    const f1 = await insertUser(db, { orgId });
    const f2 = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await db
      .insertInto('flags')
      .values([
        {
          id: newId(),
          org_id: orgId,
          target_type: 'post',
          target_id: post.id,
          flagger_id: f1.id,
          reason: 'off_topic',
        },
        {
          id: newId(),
          org_id: orgId,
          target_type: 'post',
          target_id: post.id,
          flagger_id: f2.id,
          reason: 'off_topic',
        },
      ])
      .execute();

    await db.transaction().execute(async (trx) => {
      await flagConsumer(
        {
          id: newId(),
          org_id: orgId,
          type: 'flag.created',
          post_id: post.id,
          actor_id: f1.id,
          payload: {
            flag_id: 'any',
            target_type: 'post',
            target_id: post.id,
            reason: 'off_topic',
          },
        },
        trx,
      );
    });

    const row = await db
      .selectFrom('posts')
      .select(['flag_count', 'status'])
      .where('id', '=', post.id)
      .executeTakeFirstOrThrow();
    expect(row.flag_count).toBe(2);
    expect(row.status).toBe('hidden');
    const hideEvents = await db
      .selectFrom('events')
      .selectAll()
      .where('type', '=', 'moderator.hide')
      .execute();
    expect(hideEvents).toHaveLength(1);
    expect((hideEvents[0]!.payload as { source: string }).source).toBe('auto');
    expect(hideEvents[0]!.actor_id).toBeNull();
  });

  it('does not hide below threshold', async () => {
    const author = await insertUser(db, { orgId });
    const f1 = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await db
      .insertInto('flags')
      .values({
        id: newId(),
        org_id: orgId,
        target_type: 'post',
        target_id: post.id,
        flagger_id: f1.id,
        reason: 'off_topic',
      })
      .execute();

    await db.transaction().execute(async (trx) => {
      await flagConsumer(
        {
          id: newId(),
          org_id: orgId,
          type: 'flag.created',
          post_id: post.id,
          actor_id: f1.id,
          payload: {
            flag_id: 'any',
            target_type: 'post',
            target_id: post.id,
            reason: 'off_topic',
          },
        },
        trx,
      );
    });
    const row = await db
      .selectFrom('posts')
      .select(['flag_count', 'status'])
      .where('id', '=', post.id)
      .executeTakeFirstOrThrow();
    expect(row.flag_count).toBe(1);
    expect(row.status).toBe('published');
    const hideEvents = await db
      .selectFrom('events')
      .selectAll()
      .where('type', '=', 'moderator.hide')
      .execute();
    expect(hideEvents).toHaveLength(0);
  });

  it('comment target — recomputes comments.flag_count and does NOT hide posts', async () => {
    const author = await insertUser(db, { orgId });
    const f1 = await insertUser(db, { orgId });
    const f2 = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const comment = await insertComment(db, {
      postId: post.id,
      authorId: author.id,
      orgId,
      participantId: author.id,
    });
    await db
      .insertInto('flags')
      .values([
        {
          id: newId(),
          org_id: orgId,
          target_type: 'comment',
          target_id: comment.id,
          flagger_id: f1.id,
          reason: 'off_topic',
        },
        {
          id: newId(),
          org_id: orgId,
          target_type: 'comment',
          target_id: comment.id,
          flagger_id: f2.id,
          reason: 'off_topic',
        },
      ])
      .execute();

    await db.transaction().execute(async (trx) => {
      await flagConsumer(
        {
          id: newId(),
          org_id: orgId,
          type: 'flag.created',
          post_id: post.id,
          actor_id: f1.id,
          payload: {
            flag_id: 'any',
            target_type: 'comment',
            target_id: comment.id,
            reason: 'off_topic',
          },
        },
        trx,
      );
    });
    const commentRow = await db
      .selectFrom('comments')
      .select(['flag_count', 'is_hidden'])
      .where('id', '=', comment.id)
      .executeTakeFirstOrThrow();
    expect(commentRow.flag_count).toBe(2);
    expect(commentRow.is_hidden).toBe(true);
    const postRow = await db
      .selectFrom('posts')
      .select(['flag_count', 'status'])
      .where('id', '=', post.id)
      .executeTakeFirstOrThrow();
    expect(postRow.flag_count).toBe(0);
    expect(postRow.status).toBe('published');
  });

  it('idempotent — running twice leaves count and status correct; emits at most one moderator.hide', async () => {
    const author = await insertUser(db, { orgId });
    const f1 = await insertUser(db, { orgId });
    const f2 = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await db
      .insertInto('flags')
      .values([
        {
          id: newId(),
          org_id: orgId,
          target_type: 'post',
          target_id: post.id,
          flagger_id: f1.id,
          reason: 'off_topic',
        },
        {
          id: newId(),
          org_id: orgId,
          target_type: 'post',
          target_id: post.id,
          flagger_id: f2.id,
          reason: 'off_topic',
        },
      ])
      .execute();

    for (let i = 0; i < 2; i++) {
      await db.transaction().execute(async (trx) => {
        await flagConsumer(
          {
            id: newId(),
            org_id: orgId,
            type: 'flag.created',
            post_id: post.id,
            actor_id: f1.id,
            payload: {
              flag_id: 'any',
              target_type: 'post',
              target_id: post.id,
              reason: 'off_topic',
            },
          },
          trx,
        );
      });
    }
    const row = await db
      .selectFrom('posts')
      .select(['flag_count', 'status'])
      .where('id', '=', post.id)
      .executeTakeFirstOrThrow();
    expect(row.flag_count).toBe(2);
    expect(row.status).toBe('hidden');
    const hideEvents = await db
      .selectFrom('events')
      .selectAll()
      .where('type', '=', 'moderator.hide')
      .execute();
    expect(hideEvents).toHaveLength(1);
  });

  it('flag.resolved recomputes count back down', async () => {
    const author = await insertUser(db, { orgId });
    const f1 = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const fid = newId();
    await db
      .insertInto('flags')
      .values({
        id: fid,
        org_id: orgId,
        target_type: 'post',
        target_id: post.id,
        flagger_id: f1.id,
        reason: 'off_topic',
      })
      .execute();

    await db.transaction().execute(async (trx) => {
      await flagConsumer(
        {
          id: newId(),
          org_id: orgId,
          type: 'flag.created',
          post_id: post.id,
          actor_id: f1.id,
          payload: {
            flag_id: fid,
            target_type: 'post',
            target_id: post.id,
            reason: 'off_topic',
          },
        },
        trx,
      );
    });
    expect(
      (
        await db
          .selectFrom('posts')
          .select('flag_count')
          .where('id', '=', post.id)
          .executeTakeFirstOrThrow()
      ).flag_count,
    ).toBe(1);

    await db.updateTable('flags').set({ resolved_at: new Date() }).where('id', '=', fid).execute();
    await db.transaction().execute(async (trx) => {
      await flagConsumer(
        {
          id: newId(),
          org_id: orgId,
          type: 'flag.resolved',
          post_id: post.id,
          actor_id: null,
          payload: {
            flag_id: fid,
            target_type: 'post',
            target_id: post.id,
            reason: '',
          },
        },
        trx,
      );
    });
    expect(
      (
        await db
          .selectFrom('posts')
          .select('flag_count')
          .where('id', '=', post.id)
          .executeTakeFirstOrThrow()
      ).flag_count,
    ).toBe(0);
  });
});
