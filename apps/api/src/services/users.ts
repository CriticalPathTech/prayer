// services/users.ts is NOT tenant-scoped — users span orgs by design (Option C
// identity model: one Supabase identity per email globally). However, role IS
// per-org (lives on user_orgs.role), so functions that need to return a role
// take orgId to look up the membership. The user record itself (display_name,
// email, avatar_url) is global to the identity.

import type { Database, UserRole } from '@prayer/db';
import type { Kysely } from 'kysely';

import { sanitizeDisplayName } from '../middleware/auth.js';
import { ValidationError } from '../middleware/error.js';

import { toPostDto, type PostDto, type PostRow } from './posts.js';

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

export interface UserPostsResponse {
  posts: PostDto[];
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
  const posts: PostDto[] = sliced.map((row) => toPostDto(row, caller, args.callerId));

  const last = sliced[sliced.length - 1];
  const nextCursor = hasMore && last ? encodeUserPostsCursor(last.id) : null;

  const snapshotId = posts[0]?.id ?? '00000000-0000-0000-0000-000000000000';

  return { posts, nextCursor, snapshotId };
}
