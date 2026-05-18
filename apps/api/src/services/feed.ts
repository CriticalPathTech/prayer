import type { Database, UserRole } from '@prayer/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

import { isPrivilegedRole } from '../lib/roles.js';

import { decodeCursor, encodeCursor } from './cursor.js';
import { getSnapshotId } from './feed-snapshot.js';
import { fetchHideInfo, type HideInfo } from './hide-info.js';
import { fetchMemberSet } from './membership-set.js';
import { toPostDto, type PostDto, type PostRow, type ReactionSummary } from './posts.js';

export const zFeedQuery = z.object({
  filter: z.enum(['all', 'mine', 'answered']),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type FeedQuery = z.infer<typeof zFeedQuery>;

export interface FeedResponse {
  posts: (PostDto & {
    prayed: boolean;
    reactions: Record<string, ReactionSummary>;
    updates: PostDto[];
  })[];
  nextCursor: string | null;
  snapshotId: string;
}

export async function fetchFeed(
  db: Kysely<Database>,
  args: FeedQuery & { callerRole: UserRole; callerId: string; orgId: string },
): Promise<FeedResponse> {
  const isPrivileged = isPrivilegedRole(args.callerRole);

  let q = db
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
    ])
    .where('posts.org_id', '=', args.orgId)
    .where('posts.parent_id', 'is', null)
    .$if(!isPrivileged, (b) => b.where('posts.status', '=', 'published'))
    .$if(isPrivileged, (b) => b.where('posts.status', 'in', ['published', 'hidden']))
    .where((eb) =>
      eb.or([eb('posts.expires_at', 'is', null), eb('posts.expires_at', '>', new Date())]),
    )
    .limit(args.limit + 1);

  if (args.filter === 'mine') {
    q = q.where('posts.author_id', '=', args.callerId);
  } else if (args.filter === 'answered') {
    q = q.where('posts.is_answered_prayer', '=', true);
  }

  if (args.cursor) {
    const c = decodeCursor(args.cursor, args.filter);
    q = q.where('posts.id', '<', c.id);
  }
  q = q.orderBy('posts.id', 'desc');

  const rows = (await q.execute()) as unknown as PostRow[];
  const hasMore = rows.length > args.limit;
  const page = hasMore ? rows.slice(0, args.limit) : rows;
  const last = page[page.length - 1];

  let prayedSet = new Set<string>();
  const reactionsMap = new Map<string, Record<string, ReactionSummary>>();
  const updatesByParent = new Map<string, PostDto[]>();
  if (page.length > 0) {
    const postIds = page.map((p) => p.id);
    const prayedRows = await db
      .selectFrom('prayers')
      .select('post_id')
      .where('org_id', '=', args.orgId)
      .where('user_id', '=', args.callerId)
      .where('post_id', 'in', postIds)
      .execute();
    prayedSet = new Set(prayedRows.map((r) => r.post_id));

    const reactionRows = await db
      .selectFrom('reactions')
      .select([
        'target_id',
        'emoji',
        (eb) => eb.fn.count<number>('id').as('count'),
        (eb) => sql<boolean>`bool_or(${eb.ref('author_id')} = ${args.callerId})`.as('mine'),
      ])
      .where('org_id', '=', args.orgId)
      .where('target_type', '=', 'post')
      .where('target_id', 'in', postIds)
      .groupBy(['target_id', 'emoji'])
      .execute();
    for (const row of reactionRows) {
      if (!reactionsMap.has(row.target_id)) reactionsMap.set(row.target_id, {});
      reactionsMap.get(row.target_id)![row.emoji] = { count: Number(row.count), mine: row.mine };
    }

    // Inline every published child update under its parent. Chronological
    // order (id ASC ≈ created_at ASC with UUIDv7) reads as a narrative of
    // how the prayer evolved over time. Privileged viewers also see hidden
    // children, with hide attribution merged in from the events outbox.
    const updateRows = (await db
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
      ])
      .where('posts.org_id', '=', args.orgId)
      .where('posts.parent_id', 'in', postIds)
      .$if(!isPrivileged, (b) => b.where('posts.status', '=', 'published'))
      .$if(isPrivileged, (b) => b.where('posts.status', 'in', ['published', 'hidden']))
      .orderBy('posts.parent_id')
      .orderBy('posts.id', 'asc')
      .execute()) as unknown as PostRow[];

    if (isPrivileged) {
      const hiddenChildIds = updateRows.filter((r) => r.status === 'hidden').map((r) => r.id);
      if (hiddenChildIds.length > 0) {
        const childHideInfo = await fetchHideInfo(db, hiddenChildIds, args.orgId);
        for (const row of updateRows) {
          const info = childHideInfo.get(row.id);
          if (info) {
            row.hidden_by_id = info.actorId;
            row.hidden_by_display_name = info.displayName;
            row.hidden_source = info.source;
          }
        }
      }
    }

    for (const row of updateRows) {
      // parent_id is non-null for update posts
      const parentId = row.parent_id!;
      const dto = toPostDto(row, { role: args.callerRole }, args.callerId);
      const existing = updatesByParent.get(parentId);
      if (existing) existing.push(dto);
      else updatesByParent.set(parentId, [dto]);
    }
  }

  // Enrich hidden posts with the "who hid it" attribution for privileged callers.
  const hideInfo = isPrivileged
    ? await fetchHideInfo(
        db,
        page.filter((p) => p.status === 'hidden').map((p) => p.id),
        args.orgId,
      )
    : new Map<string, HideInfo>();
  for (const row of page) {
    const info = hideInfo.get(row.id);
    if (info) {
      row.hidden_by_id = info.actorId;
      row.hidden_by_display_name = info.displayName;
      row.hidden_source = info.source;
    }
  }

  const nextCursor: string | null =
    hasMore && last ? encodeCursor({ filter: args.filter, id: last.id }) : null;

  const snapshotId = await getSnapshotId(db, args.orgId);
  const distinctAuthorIds = Array.from(
    new Set(page.map((p) => p.author_id).filter((id): id is string => id !== null)),
  );
  const memberSet = await fetchMemberSet(db, args.orgId, distinctAuthorIds);
  return {
    posts: page.map((r) => ({
      ...toPostDto(r, { role: args.callerRole }, args.callerId, memberSet),
      prayed: prayedSet.has(r.id),
      reactions: reactionsMap.get(r.id) ?? {},
      updates: updatesByParent.get(r.id) ?? [],
    })),
    nextCursor,
    snapshotId,
  };
}
