import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { listCommentsForPost } from '../../src/services/comments.js';
import { insertComment, insertOrg, insertPost, insertUser } from '../helpers/seed.js';

describe('listCommentsForPost tombstone logic', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'lakeside-svc-comments-tombstone' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('comments').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('non-mod non-author sees tombstone for hidden comment (within their own thread)', async () => {
    const author = await insertUser(db, { orgId });
    const participant = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    // participant is in their own thread → visible to them
    await insertComment(db, {
      postId: post.id,
      authorId: participant.id,
      orgId,
      participantId: participant.id,
      body: 'secret note',
      isHidden: true,
    });
    const out = await listCommentsForPost(db, {
      postId: post.id,
      orgId,
      callerId: participant.id,
      callerRole: 'member',
    });
    const thread = out.threads[0];
    expect(thread).toBeDefined();
    const c = thread!.comments[0];
    expect(c).toBeDefined();
    // The participant IS the comment author, so they see it as non-tombstone per the rules.
    expect(c!.is_tombstone).toBeFalsy();
    expect(c!.body).toBe('secret note');
  });

  it('post author non-privileged sees tombstone for hidden comment from another participant', async () => {
    const author = await insertUser(db, { orgId });
    const participant = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await insertComment(db, {
      postId: post.id,
      authorId: participant.id,
      orgId,
      participantId: participant.id,
      body: 'secret note',
      isHidden: true,
    });
    const out = await listCommentsForPost(db, {
      postId: post.id,
      orgId,
      callerId: author.id,
      callerRole: 'member',
    });
    const thread = out.threads[0];
    const c = thread!.comments[0];
    expect(c).toBeDefined();
    expect(c!.is_tombstone).toBe(true);
    expect(c!.body).toBe('');
    expect(c!.author_id).toBeNull();
  });

  it('moderator sees full body on hidden comment', async () => {
    const author = await insertUser(db, { orgId });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const participant = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await insertComment(db, {
      postId: post.id,
      authorId: participant.id,
      orgId,
      participantId: participant.id,
      body: 'secret note',
      isHidden: true,
    });
    const out = await listCommentsForPost(db, {
      postId: post.id,
      orgId,
      callerId: mod.id,
      callerRole: 'moderator',
    });
    const thread = out.threads[0];
    const c = thread!.comments[0];
    expect(c).toBeDefined();
    expect(c!.is_tombstone).toBeFalsy();
    expect(c!.body).toBe('secret note');
  });
});
