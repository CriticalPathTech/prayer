import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import {
  attachImagesToPost,
  deleteOwnPostImage,
  hydratePostImages,
  purgeAllForPost,
  purgeFullSizeForPosts,
  reapUnattachedImages,
  uploadPostImage,
  POST_IMAGES_BUCKET,
} from '../../src/services/post-images.js';
import { getTestchurchOrgId, insertPost, insertUser, makeJpeg } from '../helpers/seed.js';
import { makeInMemoryStorage, type InMemoryStorage } from '../helpers/storage.js';

describe('post-images service', () => {
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

  it('uploads, stores both variants, and returns presigned urls', async () => {
    const dto = await uploadPostImage(db, storage, {
      ownerId: userId,
      orgId,
      bytes: await makeJpeg(2000, 1000),
    });

    expect(dto.width).toBe(1600);
    expect(dto.height).toBe(800);
    expect(dto.purged).toBe(false);
    expect(dto.url).toContain(dto.id);
    expect(dto.thumb_url).toContain('_thumb');

    const row = await db
      .selectFrom('post_images')
      .selectAll()
      .where('id', '=', dto.id)
      .executeTakeFirstOrThrow();
    expect(row.post_id).toBeNull();
    expect(row.org_id).toBe(orgId);
  });

  it('rejects a fourth unattached image', async () => {
    for (let i = 0; i < 3; i += 1) {
      await uploadPostImage(db, storage, {
        ownerId: userId,
        orgId,
        bytes: await makeJpeg(100, 100),
      });
    }
    await expect(
      uploadPostImage(db, storage, {
        ownerId: userId,
        orgId,
        bytes: await makeJpeg(100, 100),
      }),
    ).rejects.toThrow(/at most 3/i);
  });

  it('delete removes the row and both objects', async () => {
    const dto = await uploadPostImage(db, storage, {
      ownerId: userId,
      orgId,
      bytes: await makeJpeg(100, 100),
    });
    await deleteOwnPostImage(db, storage, {
      imageId: dto.id,
      ownerId: userId,
      orgId,
    });

    const row = await db
      .selectFrom('post_images')
      .selectAll()
      .where('id', '=', dto.id)
      .executeTakeFirst();
    expect(row).toBeUndefined();
    await expect(
      storage.presignGet(POST_IMAGES_BUCKET, `posts/${dto.id}.webp`, 900),
    ).rejects.toThrow();
  });

  it('delete refuses a non-owner', async () => {
    const other = await insertUser(db, { orgId });
    const dto = await uploadPostImage(db, storage, {
      ownerId: userId,
      orgId,
      bytes: await makeJpeg(100, 100),
    });
    await expect(
      deleteOwnPostImage(db, storage, {
        imageId: dto.id,
        ownerId: other.id,
        orgId,
      }),
    ).rejects.toThrow();
  });

  it('delete refuses an image attached to a published post', async () => {
    const dto = await uploadPostImage(db, storage, {
      ownerId: userId,
      orgId,
      bytes: await makeJpeg(100, 100),
    });
    const post = await insertPost(db, { authorId: userId, orgId, status: 'published' });
    await db
      .updateTable('post_images')
      .set({ post_id: post.id })
      .where('id', '=', dto.id)
      .execute();

    await expect(
      deleteOwnPostImage(db, storage, {
        imageId: dto.id,
        ownerId: userId,
        orgId,
      }),
    ).rejects.toThrow();
  });

  it('hydrates images per post in position order', async () => {
    const post = await insertPost(db, { authorId: userId, orgId, status: 'published' });
    const ids: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const dto = await uploadPostImage(db, storage, {
        ownerId: userId,
        orgId,
        bytes: await makeJpeg(100, 100),
      });
      ids.push(dto.id);
      await db
        .updateTable('post_images')
        .set({ post_id: post.id, position: i })
        .where('id', '=', dto.id)
        .execute();
    }

    const map = await hydratePostImages(db, storage, {
      postIds: [post.id],
      orgId,
    });
    expect(map.get(post.id)?.map((i) => i.id)).toEqual(ids);
  });

  it('purgeFullSizeForPosts deletes the full object, keeps the thumb, stamps purged_at', async () => {
    const post = await insertPost(db, { authorId: userId, orgId, status: 'published' });
    const dto = await uploadPostImage(db, storage, {
      ownerId: userId,
      orgId,
      bytes: await makeJpeg(100, 100),
    });
    await db
      .updateTable('post_images')
      .set({ post_id: post.id })
      .where('id', '=', dto.id)
      .execute();

    await purgeFullSizeForPosts(db, storage, { postIds: [post.id] });

    await expect(
      storage.presignGet(POST_IMAGES_BUCKET, `posts/${dto.id}.webp`, 900),
    ).rejects.toThrow();
    await expect(
      storage.presignGet(POST_IMAGES_BUCKET, `posts/${dto.id}_thumb.webp`, 900),
    ).resolves.toContain('_thumb');

    const map = await hydratePostImages(db, storage, {
      postIds: [post.id],
      orgId,
    });
    expect(map.get(post.id)?.[0]?.purged).toBe(true);
    expect(map.get(post.id)?.[0]?.url).toBeNull();
  });

  it('purgeAllForPost removes rows and every object', async () => {
    const post = await insertPost(db, { authorId: userId, orgId, status: 'published' });
    const dto = await uploadPostImage(db, storage, {
      ownerId: userId,
      orgId,
      bytes: await makeJpeg(100, 100),
    });
    await db
      .updateTable('post_images')
      .set({ post_id: post.id })
      .where('id', '=', dto.id)
      .execute();

    await purgeAllForPost(db, storage, { postId: post.id });

    const row = await db
      .selectFrom('post_images')
      .selectAll()
      .where('id', '=', dto.id)
      .executeTakeFirst();
    expect(row).toBeUndefined();
    await expect(
      storage.presignGet(POST_IMAGES_BUCKET, `posts/${dto.id}_thumb.webp`, 900),
    ).rejects.toThrow();
  });

  it('reaper deletes only unattached rows past the window', async () => {
    const post = await insertPost(db, { authorId: userId, orgId, status: 'published' });
    const attached = await uploadPostImage(db, storage, {
      ownerId: userId,
      orgId,
      bytes: await makeJpeg(100, 100),
    });
    await db
      .updateTable('post_images')
      .set({ post_id: post.id })
      .where('id', '=', attached.id)
      .execute();

    const oldOrphan = await uploadPostImage(db, storage, {
      ownerId: userId,
      orgId,
      bytes: await makeJpeg(100, 100),
    });
    await db
      .updateTable('post_images')
      .set({ created_at: new Date(Date.now() - 48 * 3600_000) })
      .where('id', '=', oldOrphan.id)
      .execute();

    const freshOrphan = await uploadPostImage(db, storage, {
      ownerId: userId,
      orgId,
      bytes: await makeJpeg(100, 100),
    });

    const reaped = await reapUnattachedImages(db, storage, {
      olderThanMs: 24 * 3600_000,
    });
    expect(reaped).toBe(1);

    const remaining = await db.selectFrom('post_images').select('id').execute();
    expect(remaining.map((r) => r.id).sort()).toEqual([attached.id, freshOrphan.id].sort());
  });

  describe('attachImagesToPost', () => {
    it('re-attaching a subset detaches the dropped image and keeps the rest at their position', async () => {
      const post = await insertPost(db, { authorId: userId, orgId, status: 'draft' });
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

      await db.transaction().execute((trx) =>
        attachImagesToPost(trx, {
          imageIds: [a.id, b.id],
          postId: post.id,
          ownerId: userId,
          orgId,
        }),
      );
      await db.transaction().execute((trx) =>
        attachImagesToPost(trx, {
          imageIds: [a.id],
          postId: post.id,
          ownerId: userId,
          orgId,
        }),
      );

      const rowA = await db
        .selectFrom('post_images')
        .select(['post_id', 'position'])
        .where('id', '=', a.id)
        .executeTakeFirstOrThrow();
      expect(rowA.post_id).toBe(post.id);
      expect(rowA.position).toBe(0);

      const rowB = await db
        .selectFrom('post_images')
        .select(['post_id'])
        .where('id', '=', b.id)
        .executeTakeFirstOrThrow();
      expect(rowB.post_id).toBeNull();
    });

    it('attaching an empty list detaches every image currently on the post', async () => {
      const post = await insertPost(db, { authorId: userId, orgId, status: 'draft' });
      const a = await uploadPostImage(db, storage, {
        ownerId: userId,
        orgId,
        bytes: await makeJpeg(100, 100),
      });

      await db.transaction().execute((trx) =>
        attachImagesToPost(trx, {
          imageIds: [a.id],
          postId: post.id,
          ownerId: userId,
          orgId,
        }),
      );
      await db.transaction().execute((trx) =>
        attachImagesToPost(trx, {
          imageIds: [],
          postId: post.id,
          ownerId: userId,
          orgId,
        }),
      );

      const row = await db
        .selectFrom('post_images')
        .select('post_id')
        .where('id', '=', a.id)
        .executeTakeFirstOrThrow();
      expect(row.post_id).toBeNull();
    });

    it('rewrites positions to match the order of the imageIds argument', async () => {
      const post = await insertPost(db, { authorId: userId, orgId, status: 'draft' });
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

      await db.transaction().execute((trx) =>
        attachImagesToPost(trx, {
          imageIds: [b.id, a.id],
          postId: post.id,
          ownerId: userId,
          orgId,
        }),
      );

      const rows = await db
        .selectFrom('post_images')
        .select(['id', 'position'])
        .where('post_id', '=', post.id)
        .execute();
      expect(rows.find((r) => r.id === b.id)?.position).toBe(0);
      expect(rows.find((r) => r.id === a.id)?.position).toBe(1);
    });

    it('rejects an image owned by a different user', async () => {
      const post = await insertPost(db, { authorId: userId, orgId, status: 'draft' });
      const other = await insertUser(db, { orgId });
      const image = await uploadPostImage(db, storage, {
        ownerId: other.id,
        orgId,
        bytes: await makeJpeg(100, 100),
      });

      await expect(
        db.transaction().execute((trx) =>
          attachImagesToPost(trx, {
            imageIds: [image.id],
            postId: post.id,
            ownerId: userId,
            orgId,
          }),
        ),
      ).rejects.toThrow();
    });
  });
});
