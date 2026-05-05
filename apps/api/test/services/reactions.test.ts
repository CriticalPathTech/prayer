import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { ForbiddenError, ValidationError } from '../../src/middleware/error.js';
import { toggleReaction } from '../../src/services/reactions.js';
import { insertComment, insertOrg, insertPost, insertUser } from '../helpers/seed.js';

describe('toggleReaction: post target', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'hopechurch-svc-reactions-post' });
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

  it('adds on first toggle, removes on second (idempotent round-trip)', async () => {
    const author = await insertUser(db, { orgId });
    const reactor = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });

    const first = await toggleReaction(db, {
      callerId: reactor.id,
      callerRole: 'member',
      orgId,
      targetType: 'post',
      postId: post.id,
      targetId: post.id,
      emoji: '🙏',
    });
    expect(first.reacted).toBe(true);

    const second = await toggleReaction(db, {
      callerId: reactor.id,
      callerRole: 'member',
      orgId,
      targetType: 'post',
      postId: post.id,
      targetId: post.id,
      emoji: '🙏',
    });
    expect(second.reacted).toBe(false);

    const rows = await db.selectFrom('reactions').selectAll().execute();
    expect(rows).toHaveLength(0);
  });

  it('rejects unknown emoji with ValidationError', async () => {
    const author = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await expect(
      toggleReaction(db, {
        callerId: author.id,
        callerRole: 'member',
        orgId,
        targetType: 'post',
        postId: post.id,
        targetId: post.id,
        emoji: '🚀' as never,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('emits a reaction.added event on add', async () => {
    const author = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await toggleReaction(db, {
      callerId: author.id,
      callerRole: 'member',
      orgId,
      targetType: 'post',
      postId: post.id,
      targetId: post.id,
      emoji: '❤️',
    });
    const events = await db.selectFrom('events').selectAll().execute();
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('reaction.added');
  });
});

describe('toggleReaction: comment target', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'hopechurch-svc-reactions-comment' });
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

  it('forbids comment reaction from non-participant non-moderator', async () => {
    const postAuthor = await insertUser(db, { orgId });
    const participant = await insertUser(db, { orgId });
    const stranger = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: postAuthor.id, orgId, status: 'published' });
    const comment = await insertComment(db, {
      postId: post.id,
      authorId: participant.id,
      orgId,
      participantId: participant.id,
    });
    await expect(
      toggleReaction(db, {
        callerId: stranger.id,
        callerRole: 'member',
        orgId,
        targetType: 'comment',
        postId: post.id,
        targetId: comment.id,
        emoji: '🙏',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows moderator to react on any comment', async () => {
    const postAuthor = await insertUser(db, { orgId });
    const participant = await insertUser(db, { orgId });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const post = await insertPost(db, { authorId: postAuthor.id, orgId, status: 'published' });
    const comment = await insertComment(db, {
      postId: post.id,
      authorId: participant.id,
      orgId,
      participantId: participant.id,
    });
    const out = await toggleReaction(db, {
      callerId: mod.id,
      callerRole: 'moderator',
      orgId,
      targetType: 'comment',
      postId: post.id,
      targetId: comment.id,
      emoji: '✝️',
    });
    expect(out.reacted).toBe(true);
  });

  it('emits event with post_id = parent post id even for comment target', async () => {
    const postAuthor = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: postAuthor.id, orgId, status: 'published' });
    const comment = await insertComment(db, {
      postId: post.id,
      authorId: postAuthor.id,
      orgId,
      participantId: postAuthor.id,
    });
    await toggleReaction(db, {
      callerId: postAuthor.id,
      callerRole: 'member',
      orgId,
      targetType: 'comment',
      postId: post.id,
      targetId: comment.id,
      emoji: '🙌',
    });
    const events = await db.selectFrom('events').selectAll().execute();
    expect(events[0]!.post_id).toBe(post.id);
    expect(events[0]!.payload).toMatchObject({ target_type: 'comment', target_id: comment.id });
  });
});
