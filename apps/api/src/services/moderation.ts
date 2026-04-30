import type { Database, ReactionTargetType, UserRole } from '@prayer/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import { ForbiddenError } from '../middleware/error.js';

import { writeModerationEvent } from './events.js';

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
}

export interface ListModQueueInput {
  callerRole: UserRole;
  orgId: string;
  status?: 'pending' | 'auto_hidden' | 'manually_hidden';
  cursor?: string;
  limit: number;
}

export interface ListModQueueResult {
  items: ModQueueItem[];
  next_cursor: string | null;
}

export async function listModQueue(
  db: Kysely<Database>,
  input: ListModQueueInput,
): Promise<ListModQueueResult> {
  requireModeratorRole(input.callerRole);
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

  const items: ModQueueItem[] = page
    .filter((r) => {
      if (input.status === 'pending') return !r.hidden;
      if (input.status === 'auto_hidden') return r.hidden && r.flag_count >= 2;
      if (input.status === 'manually_hidden') return r.hidden && r.flag_count < 2;
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
      hide_source: r.hidden ? (r.flag_count >= 2 ? 'auto' : 'manual') : null,
    }));

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
