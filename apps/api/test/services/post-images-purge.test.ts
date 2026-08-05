import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { createLogger } from '../../src/lib/logger.js';
import { sweepExpired } from '../../src/services/expiry-job.js';
import { rejectPost } from '../../src/services/post-approvals.js';
import { hydratePostImages, uploadPostImage } from '../../src/services/post-images.js';
import { archivePost } from '../../src/services/posts.js';
import { getTestchurchOrgId, insertPost, insertUser, makeJpeg } from '../helpers/seed.js';
import { makeInMemoryStorage, type InMemoryStorage } from '../helpers/storage.js';

describe('purge policy', () => {
  const db = initDb(process.env.TEST_DATABASE_URL!);
  afterAll(async () => {
    await db.destroy();
  });

  let orgId: string;
  let userId: string;
  let storage: InMemoryStorage;

  beforeEach(async () => {
    await db.deleteFrom('post_images').execute();
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
    orgId = await getTestchurchOrgId(db);
    const user = await insertUser(db, { orgId });
    userId = user.id;
    storage = makeInMemoryStorage();
  });

  afterEach(async () => {
    await db.deleteFrom('post_images').execute();
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  async function postWithImage(status: 'published' | 'pending' = 'published'): Promise<{
    postId: string;
    imageId: string;
  }> {
    const post = await insertPost(db, { authorId: userId, orgId, status, body: 'test post' });
    const img = await uploadPostImage(db, storage, {
      ownerId: userId,
      orgId,
      bytes: await makeJpeg(200, 200),
    });
    await db
      .updateTable('post_images')
      .set({ post_id: post.id })
      .where('id', '=', img.id)
      .execute();
    return { postId: post.id, imageId: img.id };
  }

  it('author archive purges full-size and keeps the thumb', async () => {
    const { postId } = await postWithImage();

    await archivePost(db, storage, {
      postId,
      orgId,
      callerId: userId,
      reason: 'author',
    });

    const map = await hydratePostImages(db, storage, { postIds: [postId], orgId });
    const image = map.get(postId)?.[0];
    expect(image?.purged).toBe(true);
    expect(image?.url).toBeNull();
    expect(image?.thumb_url).toContain('_thumb');
  });

  it('does not re-purge on a second archive call for an already-archived post', async () => {
    const { postId } = await postWithImage();

    await archivePost(db, storage, { postId, orgId, callerId: userId, reason: 'author' });
    const removeCallsAfterFirst = storage.removeCalls.length;

    // Second archive call on an already-archived post must short-circuit.
    await archivePost(db, storage, { postId, orgId, callerId: userId, reason: 'author' });

    expect(storage.removeCalls.length).toBe(removeCallsAfterFirst);
  });

  it('the expiry sweep purges full-size for newly archived posts', async () => {
    const { postId } = await postWithImage();
    await db
      .updateTable('posts')
      .set({ expires_at: new Date(Date.now() - 3600_000) })
      .where('id', '=', postId)
      .execute();

    const archived = await sweepExpired(db, storage, { logger: createLogger('silent') });
    expect(archived).toBe(1);

    const map = await hydratePostImages(db, storage, { postIds: [postId], orgId });
    expect(map.get(postId)?.[0]?.purged).toBe(true);
  });

  it('reject purges everything — no rows, no objects', async () => {
    const { postId, imageId } = await postWithImage('pending');
    const mod = await insertUser(db, { orgId, role: 'moderator' });

    await rejectPost(db, storage, {
      postId,
      orgId,
      callerId: mod.id,
      callerRole: 'moderator',
    });

    const row = await db
      .selectFrom('post_images')
      .selectAll()
      .where('id', '=', imageId)
      .executeTakeFirst();
    expect(row).toBeUndefined();

    for (const bucketPath of Object.keys(storage.objects)) {
      expect(bucketPath).not.toContain(imageId);
    }
  });
});
