import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { getPostWithUpdates } from '../../src/services/posts.js';
import { insertOrg, insertPost, insertUser } from '../helpers/seed.js';

describe('getPostWithUpdates tombstone logic', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'lakeside-svc-posts-tombstone' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('non-mod non-author sees tombstone for hidden post', async () => {
    const author = await insertUser(db, { orgId });
    const viewer = await insertUser(db, { orgId });
    const post = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'hidden',
      body: 'secret body',
    });
    const out = await getPostWithUpdates(db, {
      postId: post.id,
      orgId,
      callerId: viewer.id,
      callerRole: 'member',
    });
    expect(out.post.is_tombstone).toBe(true);
    expect(out.post.body).toBe('');
    expect(out.post.author_id).toBeNull();
  });

  it('author sees full body (no tombstone) on their hidden post', async () => {
    const author = await insertUser(db, { orgId });
    const post = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'hidden',
      body: 'secret body',
    });
    const out = await getPostWithUpdates(db, {
      postId: post.id,
      orgId,
      callerId: author.id,
      callerRole: 'member',
    });
    expect(out.post.is_tombstone).toBeFalsy();
    expect(out.post.body).toBe('secret body');
  });

  it('moderator sees full body on hidden post', async () => {
    const author = await insertUser(db, { orgId });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const post = await insertPost(db, {
      authorId: author.id,
      orgId,
      status: 'hidden',
      body: 'secret body',
    });
    const out = await getPostWithUpdates(db, {
      postId: post.id,
      orgId,
      callerId: mod.id,
      callerRole: 'moderator',
    });
    expect(out.post.is_tombstone).toBeFalsy();
    expect(out.post.body).toBe('secret body');
  });
});
