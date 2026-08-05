import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { uploadPostImage } from '../../src/services/post-images.js';
import { publishOwnDraft, upsertOwnDraft } from '../../src/services/posts.js';
import { getTestchurchOrgId, insertUser, makeJpeg } from '../helpers/seed.js';
import { makeInMemoryStorage, type InMemoryStorage } from '../helpers/storage.js';

describe('images survive the publish DELETE+INSERT', () => {
  const db = initDb(process.env.TEST_DATABASE_URL!);
  afterAll(async () => {
    await db.destroy();
  });

  let orgId: string;
  let userId: string;
  let storage: InMemoryStorage;

  beforeEach(async () => {
    await db.deleteFrom('post_images').execute();
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

  it('re-points image rows onto the new post id', async () => {
    const a = await uploadPostImage(db, storage, {
      ownerId: userId,
      orgId,
      bytes: await makeJpeg(100, 100),
    });
    const b = await uploadPostImage(db, storage, {
      ownerId: userId,
      orgId,
      bytes: await makeJpeg(100, 100),
    });

    const draft = await upsertOwnDraft(db, {
      userId,
      orgId,
      callerRole: 'member',
      input: { body: 'please pray', imageIds: [a.id, b.id] },
    });

    const attached = await db
      .selectFrom('post_images')
      .select(['id', 'post_id', 'position'])
      .orderBy('position')
      .execute();
    expect(attached.every((r) => r.post_id === draft.id)).toBe(true);

    const published = await publishOwnDraft(db, {
      userId,
      orgId,
      callerRole: 'member',
      requiresPostApproval: false,
    });

    expect(published.id).not.toBe(draft.id);

    const after = await db
      .selectFrom('post_images')
      .select(['id', 'post_id', 'position'])
      .orderBy('position')
      .execute();
    expect(after).toHaveLength(2);
    expect(after.map((r) => r.post_id)).toEqual([published.id, published.id]);
    expect(after.map((r) => r.id)).toEqual([a.id, b.id]);
  });

  it('removing an image from the draft detaches it', async () => {
    const a = await uploadPostImage(db, storage, {
      ownerId: userId,
      orgId,
      bytes: await makeJpeg(100, 100),
    });
    const b = await uploadPostImage(db, storage, {
      ownerId: userId,
      orgId,
      bytes: await makeJpeg(100, 100),
    });

    await upsertOwnDraft(db, {
      userId,
      orgId,
      callerRole: 'member',
      input: { body: 'x', imageIds: [a.id, b.id] },
    });
    await upsertOwnDraft(db, {
      userId,
      orgId,
      callerRole: 'member',
      input: { body: 'x', imageIds: [a.id] },
    });

    const rowB = await db
      .selectFrom('post_images')
      .select('post_id')
      .where('id', '=', b.id)
      .executeTakeFirstOrThrow();
    expect(rowB.post_id).toBeNull();
  });

  it('rejects attaching an image owned by someone else', async () => {
    const otherUser = await insertUser(db, { orgId, email: `${Date.now()}other@e.com` });
    const foreign = await uploadPostImage(db, storage, {
      ownerId: otherUser.id,
      orgId,
      bytes: await makeJpeg(100, 100),
    });

    await expect(
      upsertOwnDraft(db, {
        userId,
        orgId,
        callerRole: 'member',
        input: { body: 'x', imageIds: [foreign.id] },
      }),
    ).rejects.toThrow();
  });
});
