import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { ForbiddenError, NotFoundError } from '../../src/middleware/error.js';
import { createFlag, dismissFlags } from '../../src/services/flags.js';
import { insertComment, insertOrg, insertPost, insertUser } from '../helpers/seed.js';

describe('createFlag', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'lakeside-svc-flags-create' });
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

  it('inserts a flag row + emits flag.created + returns flag_count', async () => {
    const author = await insertUser(db, { orgId });
    const flagger = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });

    const out = await createFlag(db, {
      callerId: flagger.id,
      orgId,
      targetType: 'post',
      postId: post.id,
      targetId: post.id,
      reason: 'off_topic',
    });

    expect(out.flag_count).toBe(0); // pre-consumer
    const flags = await db.selectFrom('flags').selectAll().execute();
    expect(flags).toHaveLength(1);
    expect(flags[0]!.reason).toBe('off_topic');
    const events = await db.selectFrom('events').selectAll().execute();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('flag.created');
  });

  it('rejects self-flag with SELF_FLAG error code', async () => {
    const author = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await expect(
      createFlag(db, {
        callerId: author.id,
        orgId,
        targetType: 'post',
        postId: post.id,
        targetId: post.id,
        reason: 'inappropriate',
      }),
    ).rejects.toMatchObject({ code: 'SELF_FLAG' });
  });

  it('409 on double-flag while open (ALREADY_FLAGGED)', async () => {
    const author = await insertUser(db, { orgId });
    const flagger = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await createFlag(db, {
      callerId: flagger.id,
      orgId,
      targetType: 'post',
      postId: post.id,
      targetId: post.id,
      reason: 'off_topic',
    });
    await expect(
      createFlag(db, {
        callerId: flagger.id,
        orgId,
        targetType: 'post',
        postId: post.id,
        targetId: post.id,
        reason: 'off_topic',
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_FLAGGED' });
  });

  it('allows re-flag after dismissal', async () => {
    const author = await insertUser(db, { orgId });
    const flagger = await insertUser(db, { orgId });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });

    await createFlag(db, {
      callerId: flagger.id,
      orgId,
      targetType: 'post',
      postId: post.id,
      targetId: post.id,
      reason: 'off_topic',
    });
    await dismissFlags(db, {
      callerId: mod.id,
      callerRole: 'moderator',
      orgId,
      targetType: 'post',
      postId: post.id,
      targetId: post.id,
    });
    const out = await createFlag(db, {
      callerId: flagger.id,
      orgId,
      targetType: 'post',
      postId: post.id,
      targetId: post.id,
      reason: 'inappropriate',
    });
    expect(out.flag_count).toBe(0);
    const openFlags = await db
      .selectFrom('flags')
      .select(['id'])
      .where('resolved_at', 'is', null)
      .execute();
    expect(openFlags).toHaveLength(1);
  });

  it('hidden target → no-op (no flag row, no event)', async () => {
    const author = await insertUser(db, { orgId });
    const flagger = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'hidden' });
    const out = await createFlag(db, {
      callerId: flagger.id,
      orgId,
      targetType: 'post',
      postId: post.id,
      targetId: post.id,
      reason: 'off_topic',
    });
    expect(out.flag_count).toBe(0);
    const flags = await db.selectFrom('flags').selectAll().execute();
    expect(flags).toHaveLength(0);
  });

  it('404 on missing target', async () => {
    const flagger = await insertUser(db, { orgId });
    await expect(
      createFlag(db, {
        callerId: flagger.id,
        orgId,
        targetType: 'post',
        postId: '019da000-0000-7000-8000-000000000000',
        targetId: '019da000-0000-7000-8000-000000000000',
        reason: 'off_topic',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404 on comment with mismatched postId', async () => {
    const author = await insertUser(db, { orgId });
    const flagger = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const otherPost = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const comment = await insertComment(db, {
      postId: post.id,
      authorId: author.id,
      orgId,
      participantId: author.id,
    });
    await expect(
      createFlag(db, {
        callerId: flagger.id,
        orgId,
        targetType: 'comment',
        postId: otherPost.id,
        targetId: comment.id,
        reason: 'inappropriate',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('dismissFlags', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'lakeside-svc-flags-dismiss' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('flags').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('marks all open flags resolved and emits one flag.resolved per row', async () => {
    const author = await insertUser(db, { orgId });
    const f1 = await insertUser(db, { orgId });
    const f2 = await insertUser(db, { orgId });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await createFlag(db, {
      callerId: f1.id,
      orgId,
      targetType: 'post',
      postId: post.id,
      targetId: post.id,
      reason: 'off_topic',
    });
    await createFlag(db, {
      callerId: f2.id,
      orgId,
      targetType: 'post',
      postId: post.id,
      targetId: post.id,
      reason: 'hateful',
    });

    const out = await dismissFlags(db, {
      callerId: mod.id,
      callerRole: 'moderator',
      orgId,
      targetType: 'post',
      postId: post.id,
      targetId: post.id,
    });
    expect(out.dismissed).toBe(2);
    const open = await db
      .selectFrom('flags')
      .select(['id'])
      .where('resolved_at', 'is', null)
      .execute();
    expect(open).toHaveLength(0);
    const resolvedEvents = await db
      .selectFrom('events')
      .selectAll()
      .where('type', '=', 'flag.resolved')
      .execute();
    expect(resolvedEvents).toHaveLength(2);
  });

  it('forbids a non-moderator caller', async () => {
    const mem = await insertUser(db, { orgId });
    const author = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await expect(
      dismissFlags(db, {
        callerId: mem.id,
        callerRole: 'member',
        orgId,
        targetType: 'post',
        postId: post.id,
        targetId: post.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
