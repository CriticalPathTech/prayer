import type { Database, UserRole } from '@prayer/db';
import type { Kysely } from 'kysely';

import { isPrivilegedRole } from '../lib/roles.js';
import { ForbiddenError, ValidationError } from '../middleware/error.js';

import { toPostDto, type PostDto, type PostRow } from './posts.js';

export interface FollowupFilters {
  noPrayers: boolean;
  noReactions: boolean;
  noComments: boolean;
  noUpdates: boolean;
  noModResponse: boolean;
}

export interface MinAge {
  value: number;
  unit: 'hours' | 'days';
}

export interface ListFollowupInput {
  callerRole: UserRole;
  callerId: string;
  orgId: string;
  filters: FollowupFilters;
  minAge: MinAge;
  sort: 'oldest' | 'newest';
  cursor?: string;
  limit: number;
}

export interface ListFollowupResult {
  items: PostDto[];
  next_cursor: string | null;
}

interface CursorPayload {
  kind: 'mod-followup';
  id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeFollowupCursor(id: string): string {
  const payload: CursorPayload = { kind: 'mod-followup', id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeFollowupCursor(token: string): string {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationError('Invalid cursor: malformed');
  }
  if (typeof raw !== 'object' || raw === null) throw new ValidationError('Invalid cursor: shape');
  const obj = raw as Record<string, unknown>;
  if (obj['kind'] !== 'mod-followup') throw new ValidationError('Invalid cursor: kind');
  if (typeof obj['id'] !== 'string' || !UUID_RE.test(obj['id'])) {
    throw new ValidationError('Invalid cursor: id');
  }
  return obj['id'];
}

export async function listFollowupPosts(
  db: Kysely<Database>,
  input: ListFollowupInput,
): Promise<ListFollowupResult> {
  if (!isPrivilegedRole(input.callerRole)) throw new ForbiddenError();

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
      'posts.pinned_at',
    ])
    .where('posts.org_id', '=', input.orgId)
    .where('posts.status', '=', 'published')
    .where('posts.parent_id', 'is', null)
    .where((eb) =>
      eb.or([eb('posts.expires_at', 'is', null), eb('posts.expires_at', '>', new Date())]),
    )
    .limit(input.limit + 1);

  if (input.cursor) {
    const lastId = decodeFollowupCursor(input.cursor);
    q =
      input.sort === 'oldest'
        ? q.where('posts.id', '>', lastId)
        : q.where('posts.id', '<', lastId);
  }

  q = input.sort === 'oldest' ? q.orderBy('posts.id', 'asc') : q.orderBy('posts.id', 'desc');

  const rows = (await q.execute()) as unknown as PostRow[];
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  const items = page.map((row) => toPostDto(row, { role: input.callerRole }, input.callerId));
  const next_cursor =
    hasMore && page.length > 0 ? encodeFollowupCursor(page[page.length - 1]!.id) : null;
  return { items, next_cursor };
}
