// services/users.ts is NOT tenant-scoped — users span orgs by design (Option C
// identity model: one Supabase identity per email globally). However, role IS
// per-org (lives on user_orgs.role), so functions that need to return a role
// take orgId to look up the membership. The user record itself (display_name,
// email, avatar_url) is global to the identity.

import type { Database, UserRole } from '@prayer/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import type { StorageClient } from '../lib/storage.js';
import { sanitizeDisplayName } from '../middleware/auth.js';
import { ValidationError } from '../middleware/error.js';

import { hydratePostImages, type PostImageDto } from './post-images.js';
import { toPostDto, type PostDto, type PostRow, type ReactionSummary } from './posts.js';

export interface UpdateDisplayNameInput {
  userId: string;
  orgId: string;
  input: string;
}

/** Return shape of the per-org PATCH /me display-name update.
 *  Includes email + role because the route surfaces the full /me payload after
 *  edit; distinct from the public profile DTO (`UserDto`) which never reveals
 *  email. */
export interface UpdateDisplayNameResult {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
}

export async function updateDisplayName(
  db: Kysely<Database>,
  { userId, orgId, input }: UpdateDisplayNameInput,
): Promise<UpdateDisplayNameResult> {
  const cleaned = sanitizeDisplayName(input ?? '');
  if (cleaned.length === 0) {
    throw new ValidationError("Name can't be empty.");
  }

  const row = await db
    .updateTable('users')
    .set({ display_name: cleaned })
    .where('id', '=', userId)
    .returning(['id', 'email', 'display_name'])
    .executeTakeFirstOrThrow();

  const membership = await db
    .selectFrom('user_orgs')
    .where('user_id', '=', userId)
    .where('org_id', '=', orgId)
    .select('role')
    .executeTakeFirstOrThrow();

  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    role: membership.role,
  };
}

// ---------------------------------------------------------------------------
// Public profile fetchers (Member Profile Page)
// ---------------------------------------------------------------------------

/** Public profile DTO returned by GET /users/:userId.
 *  Intentionally omits email — only `/me` exposes that. */
export interface UserDto {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
}

export async function fetchUserById(
  db: Kysely<Database>,
  args: { userId: string; orgId: string },
): Promise<UserDto | null> {
  const row = await db
    .selectFrom('users')
    .innerJoin('user_orgs', 'user_orgs.user_id', 'users.id')
    .where('users.id', '=', args.userId)
    .where('user_orgs.org_id', '=', args.orgId)
    .select(['users.id', 'users.display_name', 'users.avatar_url', 'user_orgs.role'])
    .executeTakeFirst();

  if (!row) return null;
  return {
    id: row.id,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    role: row.role,
  };
}

export interface UserPostsArgs {
  userId: string;
  callerRole: UserRole;
  callerId: string;
  orgId: string;
  cursor: string | null;
  limit: number;
}

/** Each post returned by `fetchUserPosts` ships with the same enrichment
 *  shape the feed uses (`prayed`, `reactions`, `updates`) so the web
 *  `PostCard` renders identically on the wall and the profile page. */
export interface UserPostsItem extends PostDto {
  prayed: boolean;
  reactions: Record<string, ReactionSummary>;
  updates: PostDto[];
}

export interface UserPostsResponse {
  posts: UserPostsItem[];
  nextCursor: string | null;
  /** Stable identifier for the current page snapshot. Mirrors the shape of
   *  `FeedResponse.snapshotId` consumed by the web `useFeed` hook so the
   *  upcoming `useUserPosts` hook can share its state machinery. We don't
   *  have a server-side feed-snapshot table for per-user post listings; the
   *  head post id is a good-enough proxy. On an empty page we return the
   *  all-zeros UUID as a sentinel. */
  snapshotId: string;
}

/** Simple opaque cursor over `posts.id` for user-posts pagination.
 *  Distinct from `services/cursor.ts` which is feed-filter-specific. */
function encodeUserPostsCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeUserPostsCursor(token: string): string {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded)) {
      throw new ValidationError('Invalid cursor');
    }
    return decoded;
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('Invalid cursor');
  }
}

/** Return the target user's published top-level prayer requests, newest first.
 *
 *  Anonymity rules (kept consistent with feed/post-detail semantics):
 *  - Self (caller === target): see all own published posts, identity intact.
 *  - super_user: see all posts including anonymous; toPostDto applies the
 *    standard mask so display_name renders as null on anonymous rows.
 *  - Anyone else (member, moderator): anonymous posts are filtered out
 *    entirely. The point of a profile page is "what has THIS person posted";
 *    showing them anonymous-masked entries would leak that the target authored
 *    something. Moderators get no privileged peek here — only super_users do.
 *
 *  Excludes: drafts, archived, hidden, pending; and any update (parent_id NOT NULL).
 */
export async function fetchUserPosts(
  db: Kysely<Database>,
  storage: StorageClient,
  args: UserPostsArgs,
): Promise<UserPostsResponse> {
  const includeAnonymous = args.callerId === args.userId || args.callerRole === 'super_user';

  let q = db
    .selectFrom('posts')
    .innerJoin('users as author', 'author.id', 'posts.author_id')
    .where('posts.author_id', '=', args.userId)
    .where('posts.org_id', '=', args.orgId)
    .where('posts.status', '=', 'published')
    .where('posts.parent_id', 'is', null)
    .select([
      'posts.id',
      'posts.parent_id',
      'posts.author_id',
      'author.display_name as author_display_name',
      'author.avatar_url as author_avatar_url',
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
    .orderBy('posts.id', 'desc')
    .limit(args.limit + 1);

  if (!includeAnonymous) {
    q = q.where('posts.is_anonymous', '=', false);
  }

  if (args.cursor) {
    const cursorId = decodeUserPostsCursor(args.cursor);
    q = q.where('posts.id', '<', cursorId);
  }

  const rows = (await q.execute()) as unknown as PostRow[];
  const hasMore = rows.length > args.limit;
  const sliced = hasMore ? rows.slice(0, args.limit) : rows;

  const caller = { role: args.callerRole };
  const baseDtos = sliced.map((row) => toPostDto(row, caller, args.callerId));

  // Batch-fetch enrichment for parity with fetchFeed. Three queries keyed on
  // the page's post ids; same pattern as services/feed.ts. Profile only ever
  // surfaces published top-level posts, so we don't need hide-info attribution
  // on the parents and we keep update children to published-only.
  let prayedSet = new Set<string>();
  const reactionsMap = new Map<string, Record<string, ReactionSummary>>();
  const updatesByParent = new Map<string, PostDto[]>();
  if (sliced.length > 0) {
    const postIds = sliced.map((p) => p.id);

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
      reactionsMap.get(row.target_id)![row.emoji] = {
        count: Number(row.count),
        mine: row.mine,
      };
    }

    // Inline published update children, oldest→newest per parent (id ASC ≈
    // created_at ASC under UUIDv7). Matches feed semantics so PostCard reads
    // the same narrative ordering. PostCard slices to the last 3 client-side.
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
        'posts.pinned_at',
      ])
      .where('posts.org_id', '=', args.orgId)
      .where('posts.parent_id', 'in', postIds)
      .where('posts.status', '=', 'published')
      .orderBy('posts.parent_id')
      .orderBy('posts.id', 'asc')
      .execute()) as unknown as PostRow[];

    const updateImagesMap = await hydratePostImages(db, storage, {
      postIds: updateRows.map((u) => u.id),
      orgId: args.orgId,
    });
    for (const row of updateRows) {
      const parentId = row.parent_id!;
      const dto = {
        ...toPostDto(row, caller, args.callerId),
        images: updateImagesMap.get(row.id) ?? [],
      };
      const existing = updatesByParent.get(parentId);
      if (existing) existing.push(dto);
      else updatesByParent.set(parentId, [dto]);
    }
  }

  const imagesMap: Map<string, PostImageDto[]> =
    sliced.length > 0
      ? await hydratePostImages(db, storage, {
          postIds: sliced.map((p) => p.id),
          orgId: args.orgId,
        })
      : new Map();

  const posts: UserPostsItem[] = baseDtos.map((dto) => ({
    ...dto,
    prayed: prayedSet.has(dto.id),
    reactions: reactionsMap.get(dto.id) ?? {},
    updates: updatesByParent.get(dto.id) ?? [],
    images: imagesMap.get(dto.id) ?? [],
  }));

  const last = sliced[sliced.length - 1];
  const nextCursor = hasMore && last ? encodeUserPostsCursor(last.id) : null;

  const snapshotId = posts[0]?.id ?? '00000000-0000-0000-0000-000000000000';

  return { posts, nextCursor, snapshotId };
}
