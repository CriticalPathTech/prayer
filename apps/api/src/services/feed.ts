import type { Database, UserRole } from '@prayer/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

import { isPrivilegedRole } from '../lib/roles.js';

import { decodeCursor, encodeCursor } from './cursor.js';
import { getSnapshotId } from './feed-snapshot.js';
import { fetchHideInfo, type HideInfo } from './hide-info.js';
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
    answered_updates: PostDto[];
  })[];
  nextCursor: string | null;
  snapshotId: string;
}

export async function fetchFeed(
  db: Kysely<Database>,
  args: FeedQuery & { callerRole: UserRole; callerId: string },
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
  const answeredUpdates = new Map<string, PostDto[]>();
  if (page.length > 0) {
    const postIds = page.map((p) => p.id);
    const prayedRows = await db
      .selectFrom('prayers')
      .select('post_id')
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
      .where('target_type', '=', 'post')
      .where('target_id', 'in', postIds)
      .groupBy(['target_id', 'emoji'])
      .execute();
    for (const row of reactionRows) {
      if (!reactionsMap.has(row.target_id)) reactionsMap.set(row.target_id, {});
      reactionsMap.get(row.target_id)![row.emoji] = { count: Number(row.count), mine: row.mine };
    }

    if (args.filter === 'answered') {
      // For each parent, fetch every child where is_answered_prayer=TRUE.
      // Chronological order (id ASC ≈ created_at ASC with UUIDv7) reads as
      // a narrative of how the prayer got answered over time.
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
        .where('posts.parent_id', 'in', postIds)
        .where('posts.is_answered_prayer', '=', true)
        .where('posts.status', '=', 'published')
        .orderBy('posts.parent_id')
        .orderBy('posts.id', 'asc')
        .execute()) as unknown as PostRow[];
      for (const row of updateRows) {
        // parent_id is non-null for update posts
        const parentId = row.parent_id!;
        const dto = toPostDto(row, { role: args.callerRole }, args.callerId);
        const existing = answeredUpdates.get(parentId);
        if (existing) existing.push(dto);
        else answeredUpdates.set(parentId, [dto]);
      }
    }
  }

  // Enrich hidden posts with the "who hid it" attribution for privileged callers.
  const hideInfo = isPrivileged
    ? await fetchHideInfo(
        db,
        page.filter((p) => p.status === 'hidden').map((p) => p.id),
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

  const snapshotId = await getSnapshotId(db);
  return {
    posts: page.map((r) => ({
      ...toPostDto(r, { role: args.callerRole }, args.callerId),
      prayed: prayedSet.has(r.id),
      reactions: reactionsMap.get(r.id) ?? {},
      answered_updates: answeredUpdates.get(r.id) ?? [],
    })),
    nextCursor,
    snapshotId,
  };
}
