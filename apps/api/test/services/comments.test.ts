import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import {
  createComment,
  editComment,
  hideComment,
  listCommentsForPost,
} from '../../src/services/comments.js';
import { insertComment, insertOrg, insertPost, insertUser } from '../helpers/seed.js';

describe('comments service', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'lakeside-svc-comments' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('events').execute();
    await db.deleteFrom('comments').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('non-author comment defaults participant_id to caller and writes an event', async () => {
    const author = await insertUser(db, { orgId });
    const commenter = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const dto = await createComment(db, {
      postId: post.id,
      orgId,
      callerId: commenter.id,
      callerRole: 'member',
      body: 'Praying',
    });
    expect(dto.participant_id).toBe(commenter.id);
    const ev = await db.selectFrom('events').selectAll().execute();
    expect(ev).toHaveLength(1);
    expect(ev[0]!.type).toBe('comment.created');
  });

  it('post author reply requires participant_id and is 400 without it', async () => {
    const author = await insertUser(db, { orgId });
    const commenter = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await insertComment(db, { postId: post.id, authorId: commenter.id, orgId });
    await expect(
      createComment(db, {
        postId: post.id,
        orgId,
        callerId: author.id,
        callerRole: 'member',
        body: 'reply',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('post author reply succeeds with participant_id pointing at a real thread', async () => {
    const author = await insertUser(db, { orgId });
    const commenter = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await insertComment(db, { postId: post.id, authorId: commenter.id, orgId });
    const dto = await createComment(db, {
      postId: post.id,
      orgId,
      callerId: author.id,
      callerRole: 'member',
      body: 'reply',
      participantId: commenter.id,
    });
    expect(dto.participant_id).toBe(commenter.id);
    expect(dto.author_id).toBe(author.id);
  });

  it('returns 404 for archived post', async () => {
    const author = await insertUser(db, { orgId });
    const commenter = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'archived' });
    await expect(
      createComment(db, {
        postId: post.id,
        orgId,
        callerId: commenter.id,
        callerRole: 'member',
        body: 'hi',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('listCommentsForPost: commenter sees only their thread', async () => {
    const author = await insertUser(db, { orgId });
    const a = await insertUser(db, { orgId });
    const b = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await insertComment(db, { postId: post.id, authorId: a.id, orgId, body: 'a1' });
    await insertComment(db, { postId: post.id, authorId: b.id, orgId, body: 'b1' });
    await insertComment(db, {
      postId: post.id,
      authorId: author.id,
      orgId,
      participantId: a.id,
      body: 'author→a',
    });

    const asA = await listCommentsForPost(db, {
      postId: post.id,
      orgId,
      callerId: a.id,
      callerRole: 'member',
    });
    expect(asA.threads).toHaveLength(1);
    expect(asA.threads[0]!.participant_id).toBe(a.id);
    expect(asA.threads[0]!.comments.map((c) => c.body)).toEqual(['a1', 'author→a']);
  });

  it('listCommentsForPost: post author sees all threads grouped by participant', async () => {
    const author = await insertUser(db, { orgId });
    const a = await insertUser(db, { orgId });
    const b = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await insertComment(db, { postId: post.id, authorId: a.id, orgId, body: 'a1' });
    await insertComment(db, { postId: post.id, authorId: b.id, orgId, body: 'b1' });
    const res = await listCommentsForPost(db, {
      postId: post.id,
      orgId,
      callerId: author.id,
      callerRole: 'member',
    });
    expect(res.threads.map((t) => t.participant_id).sort()).toEqual([a.id, b.id].sort());
  });

  it('listCommentsForPost: non-participant member sees empty threads', async () => {
    const author = await insertUser(db, { orgId });
    const a = await insertUser(db, { orgId });
    const outsider = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await insertComment(db, { postId: post.id, authorId: a.id, orgId, body: 'a1' });
    const res = await listCommentsForPost(db, {
      postId: post.id,
      orgId,
      callerId: outsider.id,
      callerRole: 'member',
    });
    expect(res.threads).toEqual([]);
  });

  it('moderator without participant_id starts own thread, invisible to unrelated member', async () => {
    const author = await insertUser(db, { orgId });
    const member = await insertUser(db, { orgId });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });

    await createComment(db, {
      postId: post.id,
      orgId,
      callerId: member.id,
      callerRole: 'member',
      body: 'member thread',
    });

    const modDto = await createComment(db, {
      postId: post.id,
      orgId,
      callerId: mod.id,
      callerRole: 'moderator',
      body: 'mod thread',
    });
    expect(modDto.participant_id).toBe(mod.id);

    const asMember = await listCommentsForPost(db, {
      postId: post.id,
      orgId,
      callerId: member.id,
      callerRole: 'member',
    });
    expect(asMember.threads).toHaveLength(1);
    expect(asMember.threads[0]!.participant_id).toBe(member.id);
    expect(asMember.threads[0]!.comments.map((c) => c.body)).toEqual(['member thread']);
  });

  it('editComment succeeds within 1h, 403 after', async () => {
    const author = await insertUser(db, { orgId });
    const commenter = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const fresh = await insertComment(db, { postId: post.id, authorId: commenter.id, orgId });
    const old = await insertComment(db, { postId: post.id, authorId: commenter.id, orgId });
    await db
      .updateTable('comments')
      .set({ created_at: new Date(Date.now() - 3700_000) })
      .where('id', '=', old.id)
      .execute();

    const edited = await editComment(db, {
      commentId: fresh.id,
      orgId,
      callerId: commenter.id,
      callerRole: 'member',
      body: 'edited',
    });
    expect(edited.body).toBe('edited');

    await expect(
      editComment(db, {
        commentId: old.id,
        orgId,
        callerId: commenter.id,
        callerRole: 'member',
        body: 'too late',
      }),
    ).rejects.toMatchObject({ code: 'EDIT_DEADLINE_PASSED' });
  });

  it('hideComment: author hides own, moderator hides any, outsider gets 403', async () => {
    const author = await insertUser(db, { orgId });
    const commenter = await insertUser(db, { orgId });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const outsider = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    const c1 = await insertComment(db, { postId: post.id, authorId: commenter.id, orgId });
    const c2 = await insertComment(db, { postId: post.id, authorId: commenter.id, orgId });

    await hideComment(db, {
      commentId: c1.id,
      orgId,
      callerId: commenter.id,
      callerRole: 'member',
    });
    const r1 = await db
      .selectFrom('comments')
      .select('is_hidden')
      .where('id', '=', c1.id)
      .executeTakeFirst();
    expect(r1?.is_hidden).toBe(true);

    await hideComment(db, { commentId: c2.id, orgId, callerId: mod.id, callerRole: 'moderator' });
    const r2 = await db
      .selectFrom('comments')
      .select('is_hidden')
      .where('id', '=', c2.id)
      .executeTakeFirst();
    expect(r2?.is_hidden).toBe(true);

    const c3 = await insertComment(db, { postId: post.id, authorId: commenter.id, orgId });
    await expect(
      hideComment(db, { commentId: c3.id, orgId, callerId: outsider.id, callerRole: 'member' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
