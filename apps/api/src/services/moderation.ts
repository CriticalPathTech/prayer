import type { Database, ReactionTargetType, UserRole } from '@prayer/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import type { StorageClient } from '../lib/storage.js';
import { ForbiddenError } from '../middleware/error.js';

import { writeModerationEvent } from './events.js';
import { hydratePostImages, type PostImageDto } from './post-images.js';

function requireModeratorRole(role: UserRole): void {
  if (role !== 'moderator' && role !== 'super_user') throw new ForbiddenError();
}

export interface HideTargetInput {
  callerId: string;
  callerRole: UserRole;
  orgId: string;
  targetType: ReactionTargetType;
  targetId: string;
}

export interface HideTargetResult {
  hidden: boolean;
}

export async function hideTarget(
  db: Kysely<Database>,
  input: HideTargetInput,
): Promise<HideTargetResult> {
  requireModeratorRole(input.callerRole);
  return db.transaction().execute(async (trx) => {
    if (input.targetType === 'post') {
      const flipped = await trx
        .updateTable('posts')
        .set({ status: 'hidden' })
        .where('id', '=', input.targetId)
        .where('org_id', '=', input.orgId)
        .where('status', '!=', 'hidden')
        .returning('id')
        .executeTakeFirst();
      if (flipped) {
        await writeModerationEvent(trx, {
          kind: 'moderator.hide',
          orgId: input.orgId,
          postId: input.targetId,
          actorId: input.callerId,
          targetType: 'post',
          targetId: input.targetId,
          source: 'manual',
        });
      }
      return { hidden: true };
    }
    const comment = await trx
      .selectFrom('comments')
      .select('post_id')
      .where('id', '=', input.targetId)
      .where('org_id', '=', input.orgId)
      .executeTakeFirst();
    if (!comment) return { hidden: true };
    const flipped = await trx
      .updateTable('comments')
      .set({ is_hidden: true })
      .where('id', '=', input.targetId)
      .where('is_hidden', '=', false)
      .returning('id')
      .executeTakeFirst();
    if (flipped) {
      await writeModerationEvent(trx, {
        kind: 'moderator.hide',
        orgId: input.orgId,
        postId: comment.post_id,
        actorId: input.callerId,
        targetType: 'comment',
        targetId: input.targetId,
        source: 'manual',
      });
    }
    return { hidden: true };
  });
}

export async function unhideTarget(
  db: Kysely<Database>,
  input: HideTargetInput,
): Promise<HideTargetResult> {
  requireModeratorRole(input.callerRole);
  return db.transaction().execute(async (trx) => {
    if (input.targetType === 'post') {
      const flipped = await trx
        .updateTable('posts')
        .set({ status: 'published' })
        .where('id', '=', input.targetId)
        .where('org_id', '=', input.orgId)
        .where('status', '=', 'hidden')
        .returning('id')
        .executeTakeFirst();
      if (flipped) {
        await writeModerationEvent(trx, {
          kind: 'moderator.unhide',
          orgId: input.orgId,
          postId: input.targetId,
          actorId: input.callerId,
          targetType: 'post',
          targetId: input.targetId,
          source: 'manual',
        });
      }
      return { hidden: false };
    }
    const comment = await trx
      .selectFrom('comments')
      .select('post_id')
      .where('id', '=', input.targetId)
      .where('org_id', '=', input.orgId)
      .executeTakeFirst();
    if (!comment) return { hidden: false };
    const flipped = await trx
      .updateTable('comments')
      .set({ is_hidden: false })
      .where('id', '=', input.targetId)
      .where('is_hidden', '=', true)
      .returning('id')
      .executeTakeFirst();
    if (flipped) {
      await writeModerationEvent(trx, {
        kind: 'moderator.unhide',
        orgId: input.orgId,
        postId: comment.post_id,
        actorId: input.callerId,
        targetType: 'comment',
        targetId: input.targetId,
        source: 'manual',
      });
    }
    return { hidden: false };
  });
}

export interface ModQueueItem {
  target_type: 'post' | 'comment';
  target_id: string;
  post_id: string;
  author_display_name: string | null;
  preview: string;
  flag_count: number;
  reasons: string[];
  first_flag_at: string;
  latest_flag_at: string;
  hidden: boolean;
  hide_source: 'auto' | 'manual' | null;
  /** Only present for target_type='post' — comments don't carry photos.
   * Empty array when the post has none, never absent. */
  images: PostImageDto[];
}

export interface ListModQueueInput {
  callerRole: UserRole;
  orgId: string;
  status?: 'pending' | 'auto_hidden' | 'manually_hidden' | 'hidden';
  cursor?: string;
  limit: number;
}

export interface ListModQueueResult {
  items: ModQueueItem[];
  next_cursor: string | null;
}

/** Batch-hydrate images for the 'post' rows of a mod-queue page and attach
 * them; comment rows always get an empty array since only posts carry photos. */
async function attachQueueImages<T extends { target_type: 'post' | 'comment'; target_id: string }>(
  db: Kysely<Database>,
  storage: StorageClient,
  orgId: string,
  items: T[],
): Promise<(T & { images: PostImageDto[] })[]> {
  const postIds = items.filter((i) => i.target_type === 'post').map((i) => i.target_id);
  const imagesMap = await hydratePostImages(db, storage, { postIds, orgId });
  return items.map((i) => ({
    ...i,
    images: i.target_type === 'post' ? (imagesMap.get(i.target_id) ?? []) : [],
  }));
}

export async function listModQueue(
  db: Kysely<Database>,
  storage: StorageClient,
  input: ListModQueueInput,
): Promise<ListModQueueResult> {
  requireModeratorRole(input.callerRole);
  // The "Hidden" tab is driven by posts.status='hidden' / comments.is_hidden,
  // not by flags — manual hides for items that were never flagged (or whose
  // flags were dismissed) must still show up here. Other statuses keep the
  // flag-driven path because they aggregate over unresolved flags.
  if (input.status === 'hidden') {
    return listHiddenItems(db, storage, input);
  }
  const rows = await sql<{
    target_type: 'post' | 'comment';
    target_id: string;
    post_id: string;
    author_display_name: string | null;
    preview: string;
    flag_count: number;
    reasons: string[];
    first_flag_at: Date;
    latest_flag_at: Date;
    hidden: boolean;
  }>`
    WITH q AS (
      SELECT
        f.target_type,
        f.target_id,
        MIN(f.created_at) AS first_flag_at,
        MAX(f.created_at) AS latest_flag_at,
        COUNT(*) AS flag_count,
        ARRAY_AGG(DISTINCT f.reason) AS reasons
      FROM flags f
      WHERE f.resolved_at IS NULL
        AND f.org_id = ${input.orgId}
      GROUP BY f.target_type, f.target_id
    )
    SELECT
      q.target_type,
      q.target_id,
      COALESCE(p.id, c.post_id) AS post_id,
      COALESCE(pu.display_name, cu.display_name) AS author_display_name,
      SUBSTRING(COALESCE(p.body, c.body) FOR 120) AS preview,
      q.flag_count::int AS flag_count,
      q.reasons,
      q.first_flag_at,
      q.latest_flag_at,
      COALESCE(p.status = 'hidden', c.is_hidden, false) AS hidden
    FROM q
    LEFT JOIN posts p    ON q.target_type = 'post'    AND p.id = q.target_id
    LEFT JOIN comments c ON q.target_type = 'comment' AND c.id = q.target_id
    LEFT JOIN users pu   ON pu.id = p.author_id
    LEFT JOIN users cu   ON cu.id = c.author_id
    ORDER BY q.latest_flag_at DESC, q.target_type DESC, q.target_id DESC
    LIMIT ${input.limit + 1}
  `.execute(db);

  const page = rows.rows.slice(0, input.limit);
  const hasMore = rows.rows.length > input.limit;
  const next = hasMore && page.length > 0 ? page[page.length - 1] : null;

  const filtered = page
    .filter((r) => {
      if (input.status === 'pending') return !r.hidden;
      if (input.status === 'auto_hidden') return r.hidden && r.flag_count >= 2;
      if (input.status === 'manually_hidden') return r.hidden && r.flag_count < 2;
      if (input.status === 'hidden') return r.hidden;
      return true;
    })
    .map((r) => ({
      target_type: r.target_type,
      target_id: r.target_id,
      post_id: r.post_id,
      author_display_name: r.author_display_name,
      preview: r.preview,
      flag_count: Number(r.flag_count),
      reasons: r.reasons,
      first_flag_at: r.first_flag_at.toISOString(),
      latest_flag_at: r.latest_flag_at.toISOString(),
      hidden: r.hidden,
      hide_source: (r.hidden ? (r.flag_count >= 2 ? 'auto' : 'manual') : null) as
        'auto' | 'manual' | null,
    }));
  const items: ModQueueItem[] = await attachQueueImages(db, storage, input.orgId, filtered);

  const next_cursor =
    next != null
      ? Buffer.from(
          JSON.stringify({
            latestFlagAt: next.latest_flag_at.toISOString(),
            targetType: next.target_type,
            targetId: next.target_id,
          }),
          'utf8',
        ).toString('base64url')
      : null;

  return { items, next_cursor };
}

/** Driven by the items' own hidden state, not by flags. Surfaces:
 *  - auto-hidden posts/comments (≥2 unresolved flags),
 *  - manually-hidden items (with or without resolved/active flags).
 *  Flag info is attached when available (counts / reasons / latest_flag_at)
 *  but is never used as the inclusion gate. */
async function listHiddenItems(
  db: Kysely<Database>,
  storage: StorageClient,
  input: ListModQueueInput,
): Promise<ListModQueueResult> {
  const rows = await sql<{
    target_type: 'post' | 'comment';
    target_id: string;
    post_id: string;
    author_display_name: string | null;
    preview: string;
    flag_count: number;
    reasons: string[] | null;
    first_flag_at: Date;
    latest_flag_at: Date;
    hidden: boolean;
  }>`
    WITH hidden_posts AS (
      SELECT
        'post'::reaction_target_type AS target_type,
        p.id        AS target_id,
        p.id        AS post_id,
        pu.display_name AS author_display_name,
        SUBSTRING(p.body FOR 120) AS preview,
        p.created_at AS item_created_at
      FROM posts p
      LEFT JOIN users pu ON pu.id = p.author_id
      WHERE p.org_id = ${input.orgId} AND p.status = 'hidden'
    ),
    hidden_comments AS (
      SELECT
        'comment'::reaction_target_type AS target_type,
        c.id        AS target_id,
        c.post_id   AS post_id,
        cu.display_name AS author_display_name,
        SUBSTRING(c.body FOR 120) AS preview,
        c.created_at AS item_created_at
      FROM comments c
      LEFT JOIN users cu ON cu.id = c.author_id
      WHERE c.org_id = ${input.orgId} AND c.is_hidden = TRUE
    ),
    hidden_all AS (
      SELECT * FROM hidden_posts
      UNION ALL
      SELECT * FROM hidden_comments
    ),
    flag_agg AS (
      SELECT
        f.target_type,
        f.target_id,
        COUNT(*)::int                 AS flag_count,
        ARRAY_AGG(DISTINCT f.reason)  AS reasons,
        MIN(f.created_at)             AS first_flag_at,
        MAX(f.created_at)             AS latest_flag_at
      FROM flags f
      WHERE f.org_id = ${input.orgId} AND f.resolved_at IS NULL
      GROUP BY f.target_type, f.target_id
    )
    SELECT
      h.target_type,
      h.target_id,
      h.post_id,
      h.author_display_name,
      h.preview,
      COALESCE(fa.flag_count, 0)::int                AS flag_count,
      COALESCE(fa.reasons, ARRAY[]::TEXT[])          AS reasons,
      COALESCE(fa.first_flag_at, h.item_created_at)  AS first_flag_at,
      COALESCE(fa.latest_flag_at, h.item_created_at) AS latest_flag_at,
      TRUE AS hidden
    FROM hidden_all h
    LEFT JOIN flag_agg fa
      ON fa.target_type = h.target_type
     AND fa.target_id   = h.target_id
    ORDER BY COALESCE(fa.latest_flag_at, h.item_created_at) DESC,
             h.target_type DESC,
             h.target_id DESC
    LIMIT ${input.limit + 1}
  `.execute(db);

  const page = rows.rows.slice(0, input.limit);
  const hasMore = rows.rows.length > input.limit;
  const next = hasMore && page.length > 0 ? page[page.length - 1] : null;

  const mapped = page.map((r) => ({
    target_type: r.target_type,
    target_id: r.target_id,
    post_id: r.post_id,
    author_display_name: r.author_display_name,
    preview: r.preview,
    flag_count: Number(r.flag_count),
    reasons: r.reasons ?? [],
    first_flag_at: r.first_flag_at.toISOString(),
    latest_flag_at: r.latest_flag_at.toISOString(),
    hidden: true,
    hide_source: (r.flag_count >= 2 ? 'auto' : 'manual') as 'auto' | 'manual',
  }));
  const items: ModQueueItem[] = await attachQueueImages(db, storage, input.orgId, mapped);

  const next_cursor =
    next != null
      ? Buffer.from(
          JSON.stringify({
            latestFlagAt: next.latest_flag_at.toISOString(),
            targetType: next.target_type,
            targetId: next.target_id,
          }),
          'utf8',
        ).toString('base64url')
      : null;

  return { items, next_cursor };
}
