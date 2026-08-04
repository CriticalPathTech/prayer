// post-images.ts owns every read and write of the `post_images` table.
//
// Access model: the bucket is PRIVATE. Nothing in the app hands out a raw
// object URL; readers get a 15-minute presigned GET minted only after the
// caller has already cleared requireAuth + requireMember + org context at the
// route layer. That is what makes "invite-only" true for photos, which are
// often more identifying than the prayer text itself.
//
// Lifecycle: post_id NULL means uploaded-but-unattached. Attach happens on
// draft save; publish re-points rows onto the new post id (see posts.ts —
// publishOwnDraft's DELETE+INSERT needs special handling). Archive purges the
// full-size object and keeps the thumb; reject purges everything; the reaper
// sweeps rows still unattached after 24h.

import { newId, type Database } from '@prayer/db';
import { sql, type Kysely, type Transaction } from 'kysely';

import { processPostImage, UnsupportedImageError } from '../lib/image-processing.js';
import type { StorageClient } from '../lib/storage.js';
import {
  ForbiddenError,
  NotFoundError,
  StorageError,
  ValidationError,
} from '../middleware/error.js';

export const POST_IMAGES_BUCKET = 'post-images';
export const MAX_IMAGES_PER_POST = 3;
export const PRESIGN_TTL_SECONDS = 900;

export interface PostImageDto {
  id: string;
  /** Presigned full-size URL; null once the post archived and it was purged. */
  url: string | null;
  thumb_url: string;
  width: number;
  height: number;
  purged: boolean;
}

type Db = Kysely<Database> | Transaction<Database>;

function fullKey(imageId: string): string {
  return `posts/${imageId}.webp`;
}

function thumbKey(imageId: string): string {
  return `posts/${imageId}_thumb.webp`;
}

export async function uploadPostImage(
  db: Db,
  storage: StorageClient,
  input: { ownerId: string; orgId: string; bytes: Buffer },
): Promise<PostImageDto> {
  // Count what the caller already has in flight: unattached rows plus
  // anything already hung off their draft. Published posts are frozen, so
  // their images don't count against a new compose.
  const { count } = await db
    .selectFrom('post_images')
    .leftJoin('posts', 'posts.id', 'post_images.post_id')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('post_images.owner_id', '=', input.ownerId)
    .where('post_images.org_id', '=', input.orgId)
    .where((eb) => eb.or([eb('post_images.post_id', 'is', null), eb('posts.status', '=', 'draft')]))
    .executeTakeFirstOrThrow();

  const existing = Number(count);
  if (existing >= MAX_IMAGES_PER_POST) {
    throw new ValidationError(`A prayer request can have at most ${MAX_IMAGES_PER_POST} photos.`);
  }

  let processed;
  try {
    processed = await processPostImage(input.bytes);
  } catch (err) {
    if (err instanceof UnsupportedImageError) throw new ValidationError(err.message);
    throw err;
  }

  const id = newId();
  try {
    await storage.upload(POST_IMAGES_BUCKET, fullKey(id), processed.full, {
      contentType: 'image/webp',
    });
    await storage.upload(POST_IMAGES_BUCKET, thumbKey(id), processed.thumb, {
      contentType: 'image/webp',
    });
  } catch {
    // Best-effort cleanup so a half-written pair doesn't linger unreferenced.
    // No row exists yet, so the reaper would never find these.
    try {
      await storage.remove(POST_IMAGES_BUCKET, [fullKey(id), thumbKey(id)]);
    } catch {
      // nothing more to do.
    }
    throw new StorageError();
  }

  await db
    .insertInto('post_images')
    .values({
      id,
      org_id: input.orgId,
      owner_id: input.ownerId,
      post_id: null,
      position: existing,
      storage_key: fullKey(id),
      thumb_key: thumbKey(id),
      width: processed.width,
      height: processed.height,
      byte_size: processed.full.byteLength,
    })
    .execute();

  return {
    id,
    url: await storage.presignGet(POST_IMAGES_BUCKET, fullKey(id), PRESIGN_TTL_SECONDS),
    thumb_url: await storage.presignGet(POST_IMAGES_BUCKET, thumbKey(id), PRESIGN_TTL_SECONDS),
    width: processed.width,
    height: processed.height,
    purged: false,
  };
}

export async function deleteOwnPostImage(
  db: Db,
  storage: StorageClient,
  input: { imageId: string; ownerId: string; orgId: string },
): Promise<void> {
  const row = await db
    .selectFrom('post_images')
    .leftJoin('posts', 'posts.id', 'post_images.post_id')
    .select([
      'post_images.id',
      'post_images.owner_id',
      'post_images.storage_key',
      'post_images.thumb_key',
      'post_images.post_id',
      'posts.status as post_status',
    ])
    .where('post_images.id', '=', input.imageId)
    .where('post_images.org_id', '=', input.orgId)
    .executeTakeFirst();

  if (!row) throw new NotFoundError('Image not found');
  if (row.owner_id !== input.ownerId) throw new ForbiddenError();
  // Published (or otherwise non-draft) posts freeze their image set.
  if (row.post_id !== null && row.post_status !== 'draft') {
    throw new ForbiddenError('Photos cannot be changed after a prayer is shared.');
  }

  await db.deleteFrom('post_images').where('id', '=', input.imageId).execute();

  try {
    await storage.remove(POST_IMAGES_BUCKET, [row.storage_key, row.thumb_key]);
  } catch {
    // Row is gone, so the image is invisible. Objects leak; acceptable.
  }
}

export async function hydratePostImages(
  db: Db,
  storage: StorageClient,
  args: { postIds: string[]; orgId: string },
): Promise<Map<string, PostImageDto[]>> {
  const map = new Map<string, PostImageDto[]>();
  if (args.postIds.length === 0) return map;

  const rows = await db
    .selectFrom('post_images')
    .select(['id', 'post_id', 'storage_key', 'thumb_key', 'width', 'height', 'purged_at'])
    .where('post_id', 'in', args.postIds)
    .where('org_id', '=', args.orgId)
    .orderBy('post_id')
    .orderBy('position')
    .execute();

  for (const row of rows) {
    if (row.post_id === null) continue;
    const purged = row.purged_at !== null;
    const dto: PostImageDto = {
      id: row.id,
      url: purged
        ? null
        : await storage.presignGet(POST_IMAGES_BUCKET, row.storage_key, PRESIGN_TTL_SECONDS),
      thumb_url: await storage.presignGet(POST_IMAGES_BUCKET, row.thumb_key, PRESIGN_TTL_SECONDS),
      width: row.width,
      height: row.height,
      purged,
    };
    const list = map.get(row.post_id);
    if (list) list.push(dto);
    else map.set(row.post_id, [dto]);
  }

  return map;
}

/** Archive policy: drop the expensive object, keep the ~5%-sized thumb. */
export async function purgeFullSizeForPosts(
  db: Db,
  storage: StorageClient,
  args: { postIds: string[] },
): Promise<void> {
  if (args.postIds.length === 0) return;

  const rows = await db
    .selectFrom('post_images')
    .select(['id', 'storage_key'])
    .where('post_id', 'in', args.postIds)
    .where('purged_at', 'is', null)
    .execute();
  if (rows.length === 0) return;

  await db
    .updateTable('post_images')
    .set({ purged_at: new Date() })
    .where(
      'id',
      'in',
      rows.map((r) => r.id),
    )
    .execute();

  try {
    await storage.remove(
      POST_IMAGES_BUCKET,
      rows.map((r) => r.storage_key),
    );
  } catch {
    // purged_at is already set, so nothing renders the missing object.
  }
}

/** Decline/reject policy: the content was rejected — remove every trace. */
export async function purgeAllForPost(
  db: Db,
  storage: StorageClient,
  args: { postId: string },
): Promise<void> {
  const rows = await db
    .selectFrom('post_images')
    .select(['id', 'storage_key', 'thumb_key'])
    .where('post_id', '=', args.postId)
    .execute();
  if (rows.length === 0) return;

  await db
    .deleteFrom('post_images')
    .where(
      'id',
      'in',
      rows.map((r) => r.id),
    )
    .execute();

  try {
    await storage.remove(
      POST_IMAGES_BUCKET,
      rows.flatMap((r) => [r.storage_key, r.thumb_key]),
    );
  } catch {
    // Rows are gone; objects leak. Acceptable.
  }
}

/**
 * The orphan mechanism. Uploads happen the instant a user picks a photo, so a
 * user who picks three and closes the tab leaves three unreferenced rows.
 * This also bounds storage for clients that keep drafts in browser storage
 * and therefore never attach.
 */
export async function reapUnattachedImages(
  db: Db,
  storage: StorageClient,
  args: { olderThanMs: number },
): Promise<number> {
  const cutoff = new Date(Date.now() - args.olderThanMs);

  const rows = await db
    .selectFrom('post_images')
    .select(['id', 'storage_key', 'thumb_key'])
    .where('post_id', 'is', null)
    .where(sql`created_at`, '<', cutoff)
    .execute();
  if (rows.length === 0) return 0;

  await db
    .deleteFrom('post_images')
    .where(
      'id',
      'in',
      rows.map((r) => r.id),
    )
    .execute();

  try {
    await storage.remove(
      POST_IMAGES_BUCKET,
      rows.flatMap((r) => [r.storage_key, r.thumb_key]),
    );
  } catch {
    // Rows are gone; objects leak. Acceptable.
  }

  return rows.length;
}

/**
 * Attach an ordered image list to a post, inside a caller-provided
 * transaction. Used by draft save and by publish. Validates ownership and
 * the 3-image cap. S3 is never touched here — this is pure row bookkeeping.
 */
export async function attachImagesToPost(
  trx: Transaction<Database>,
  args: { imageIds: string[]; postId: string; ownerId: string; orgId: string },
): Promise<void> {
  if (args.imageIds.length > MAX_IMAGES_PER_POST) {
    throw new ValidationError(`A prayer request can have at most ${MAX_IMAGES_PER_POST} photos.`);
  }

  // Detach anything currently on this post that isn't in the new list, so a
  // removed-then-resaved draft doesn't keep stale rows attached.
  await trx
    .updateTable('post_images')
    .set({ post_id: null })
    .where('post_id', '=', args.postId)
    .$if(args.imageIds.length > 0, (qb) => qb.where('id', 'not in', args.imageIds))
    .execute();

  if (args.imageIds.length === 0) return;

  const owned = await trx
    .selectFrom('post_images')
    .select('id')
    .where('id', 'in', args.imageIds)
    .where('owner_id', '=', args.ownerId)
    .where('org_id', '=', args.orgId)
    .execute();
  if (owned.length !== args.imageIds.length) {
    throw new ValidationError('Unknown image.');
  }

  for (const [index, imageId] of args.imageIds.entries()) {
    await trx
      .updateTable('post_images')
      .set({ post_id: args.postId, position: index })
      .where('id', '=', imageId)
      .execute();
  }
}
