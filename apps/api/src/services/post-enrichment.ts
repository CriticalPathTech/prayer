import type { Database, UserRole } from '@prayer/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import { toPostDto, type PostDto, type PostRow, type ReactionSummary } from './posts.js';

export interface EnrichmentContext {
  orgId: string;
  callerId: string;
  callerRole: UserRole;
}

/** Post ids the caller has prayed for. */
export async function fetchPrayedSet(
  db: Kysely<Database>,
  postIds: string[],
  ctx: EnrichmentContext,
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const rows = await db
    .selectFrom('prayers')
    .select('post_id')
    .where('org_id', '=', ctx.orgId)
    .where('user_id', '=', ctx.callerId)
    .where('post_id', 'in', postIds)
    .execute();
  return new Set(rows.map((r) => r.post_id));
}

/** Per-post, per-emoji reaction counts with a caller-specific `mine` flag. */
export async function fetchReactionsMap(
  db: Kysely<Database>,
  postIds: string[],
  ctx: EnrichmentContext,
): Promise<Map<string, Record<string, ReactionSummary>>> {
  const out = new Map<string, Record<string, ReactionSummary>>();
  if (postIds.length === 0) return out;
  const rows = await db
    .selectFrom('reactions')
    .select([
      'target_id',
      'emoji',
      (eb) => eb.fn.count<number>('id').as('count'),
      (eb) => sql<boolean>`bool_or(${eb.ref('author_id')} = ${ctx.callerId})`.as('mine'),
    ])
    .where('org_id', '=', ctx.orgId)
    .where('target_type', '=', 'post')
    .where('target_id', 'in', postIds)
    .groupBy(['target_id', 'emoji'])
    .execute();
  for (const row of rows) {
    if (!out.has(row.target_id)) out.set(row.target_id, {});
    out.get(row.target_id)![row.emoji] = { count: Number(row.count), mine: row.mine };
  }
  return out;
}

/**
 * Published child updates keyed by parent id, oldest → newest. Ordering by
 * `posts.id` is chronological under UUIDv7 and is what the cards rely on when
 * they show only the most recent updates.
 */
export async function fetchUpdatesByParent(
  db: Kysely<Database>,
  postIds: string[],
  ctx: EnrichmentContext,
): Promise<Map<string, PostDto[]>> {
  const out = new Map<string, PostDto[]>();
  if (postIds.length === 0) return out;
  const rows = (await db
    .selectFrom('posts')
    .innerJoin('users', 'users.id', 'posts.author_id')
    .select([
      'posts.id',
      'posts.parent_id',
      'posts.author_id',
      'users.display_name as author_display_name',
      'users.avatar_url as author_avatar_url',
      'posts.status',
      'posts.is_anonymous',
      'posts.is_answered_prayer',
      'posts.body',
      'posts.reaction_count',
      'posts.prayer_count',
      'posts.expires_at',
      'posts.edit_deadline',
      'posts.created_at',
      'posts.pinned_at',
    ])
    .where('posts.org_id', '=', ctx.orgId)
    .where('posts.parent_id', 'in', postIds)
    .where('posts.status', '=', 'published')
    .orderBy('posts.parent_id')
    .orderBy('posts.id', 'asc')
    .execute()) as unknown as PostRow[];
  for (const row of rows) {
    const parentId = row.parent_id!;
    const dto = toPostDto(row, { role: ctx.callerRole }, ctx.callerId);
    const existing = out.get(parentId);
    if (existing) existing.push(dto);
    else out.set(parentId, [dto]);
  }
  return out;
}
