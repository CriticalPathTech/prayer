import type { Database } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { ForbiddenError } from '../../src/middleware/error.js';
import { hideTarget, listModQueue, unhideTarget } from '../../src/services/moderation.js';
import { insertComment, insertOrg, insertPost, insertUser } from '../helpers/seed.js';
import { makeInMemoryStorage } from '../helpers/storage.js';

const storage = makeInMemoryStorage();

describe('hideTarget / unhideTarget', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'testchurch-svc-moderation-hide' });
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

  it('hideTarget flips posts.status to hidden + emits moderator.hide manual', async () => {
    const author = await insertUser(db, { orgId });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });

    const out = await hideTarget(db, {
      callerId: mod.id,
      callerRole: 'moderator',
      orgId,
      targetType: 'post',
      targetId: post.id,
    });
    expect(out.hidden).toBe(true);
    const row = await db
      .selectFrom('posts')
      .select('status')
      .where('id', '=', post.id)
      .executeTakeFirst();
    expect(row?.status).toBe('hidden');
    const events = await db
      .selectFrom('events')
      .selectAll()
      .where('type', '=', 'moderator.hide')
      .execute();
    expect(events).toHaveLength(1);
    expect((events[0]!.payload as { source: string }).source).toBe('manual');
  });

  it('hideTarget is idempotent — already hidden returns { hidden: true } without new event', async () => {
    const author = await insertUser(db, { orgId });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'hidden' });
    const out = await hideTarget(db, {
      callerId: mod.id,
      callerRole: 'moderator',
      orgId,
      targetType: 'post',
      targetId: post.id,
    });
    expect(out.hidden).toBe(true);
    const events = await db.selectFrom('events').selectAll().execute();
    expect(events).toHaveLength(0);
  });

  it('hideTarget forbids a member caller', async () => {
    const mem = await insertUser(db, { orgId });
    const author = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await expect(
      hideTarget(db, {
        callerId: mem.id,
        callerRole: 'member',
        orgId,
        targetType: 'post',
        targetId: post.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('unhideTarget flips back + emits moderator.unhide; does NOT auto-dismiss flags', async () => {
    const author = await insertUser(db, { orgId });
    const flagger = await insertUser(db, { orgId });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'hidden' });
    await db
      .insertInto('flags')
      .values({
        id: newId(),
        org_id: orgId,
        target_type: 'post',
        target_id: post.id,
        flagger_id: flagger.id,
        reason: 'off_topic',
      })
      .execute();

    const out = await unhideTarget(db, {
      callerId: mod.id,
      callerRole: 'moderator',
      orgId,
      targetType: 'post',
      targetId: post.id,
    });
    expect(out.hidden).toBe(false);
    const row = await db
      .selectFrom('posts')
      .select('status')
      .where('id', '=', post.id)
      .executeTakeFirst();
    expect(row?.status).toBe('published');
    const openFlags = await db
      .selectFrom('flags')
      .select('id')
      .where('resolved_at', 'is', null)
      .execute();
    expect(openFlags).toHaveLength(1);
  });

  it('unhideTarget on a non-hidden post is idempotent (no event)', async () => {
    const author = await insertUser(db, { orgId });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const out = await unhideTarget(db, {
      callerId: mod.id,
      callerRole: 'moderator',
      orgId,
      targetType: 'post',
      targetId: post.id,
    });
    expect(out.hidden).toBe(false);
    const events = await db.selectFrom('events').selectAll().execute();
    expect(events).toHaveLength(0);
  });

  it('hideTarget + unhideTarget for comments flip is_hidden', async () => {
    const author = await insertUser(db, { orgId });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const comment = await insertComment(db, {
      postId: post.id,
      authorId: author.id,
      orgId,
      participantId: author.id,
    });
    await hideTarget(db, {
      callerId: mod.id,
      callerRole: 'moderator',
      orgId,
      targetType: 'comment',
      targetId: comment.id,
    });
    let row = await db
      .selectFrom('comments')
      .select('is_hidden')
      .where('id', '=', comment.id)
      .executeTakeFirst();
    expect(row?.is_hidden).toBe(true);
    await unhideTarget(db, {
      callerId: mod.id,
      callerRole: 'moderator',
      orgId,
      targetType: 'comment',
      targetId: comment.id,
    });
    row = await db
      .selectFrom('comments')
      .select('is_hidden')
      .where('id', '=', comment.id)
      .executeTakeFirst();
    expect(row?.is_hidden).toBe(false);
  });
});

describe('listModQueue', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'testchurch-svc-moderation-queue' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('flags').execute();
    await db.deleteFrom('comments').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('returns pending targets with dedup + flag_count + reasons', async () => {
    const author = await insertUser(db, { orgId });
    const f1 = await insertUser(db, { orgId });
    const f2 = await insertUser(db, { orgId });
    const post = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'published',
      body: 'hello',
    });
    // Manually set flag_count to 2 since the consumer isn't running in this test.
    await db.updateTable('posts').set({ flag_count: 2 }).where('id', '=', post.id).execute();

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
          reason: 'hateful',
        },
      ])
      .execute();

    const out = await listModQueue(db, storage, {
      callerRole: 'moderator',
      orgId,
      status: 'pending',
      limit: 20,
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.flag_count).toBe(2);
    expect(new Set(out.items[0]!.reasons)).toEqual(new Set(['off_topic', 'hateful']));
  });

  it('non-moderator caller throws', async () => {
    await expect(
      listModQueue(db, storage, { callerRole: 'member', orgId, limit: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('status=hidden surfaces manually-hidden posts that have no unresolved flags', async () => {
    const author = await insertUser(db, { orgId });
    // Post was flagged once then the flag was resolved/dismissed, and the mod
    // hid the post via the kebab menu. Result: posts.status=hidden,
    // 0 unresolved flags. The Hidden tab must still surface this row.
    const post = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'hidden',
      body: 'manually hidden after flag dismissed',
    });
    const flagger = await insertUser(db, { orgId });
    await db
      .insertInto('flags')
      .values({
        id: newId(),
        org_id: orgId,
        target_type: 'post',
        target_id: post.id,
        flagger_id: flagger.id,
        reason: 'off_topic',
        resolved_at: new Date(),
        resolved_by_id: flagger.id,
      })
      .execute();

    const out = await listModQueue(db, storage, {
      callerRole: 'moderator',
      orgId,
      status: 'hidden',
      limit: 20,
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.target_id).toBe(post.id);
    expect(out.items[0]!.hidden).toBe(true);
    expect(out.items[0]!.flag_count).toBe(0);
    expect(out.items[0]!.hide_source).toBe('manual');
  });

  it('status=hidden surfaces a hidden post that was never flagged at all', async () => {
    const author = await insertUser(db, { orgId });
    const post = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'hidden',
      body: 'hidden manually, never flagged',
    });
    const out = await listModQueue(db, storage, {
      callerRole: 'moderator',
      orgId,
      status: 'hidden',
      limit: 20,
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.target_id).toBe(post.id);
    expect(out.items[0]!.flag_count).toBe(0);
    expect(out.items[0]!.reasons).toEqual([]);
  });
});
