import type { Database, PostStatus, UserRole } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely, Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';

import { isPrivilegedRole } from '../lib/roles.js';
import {
  EditDeadlinePassedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../middleware/error.js';

import { writePostEvent } from './events.js';
import { fetchHideInfo } from './hide-info.js';
import { fetchMemberSet } from './membership-set.js';

export interface PostRow {
  id: string;
  parent_id: string | null;
  author_id: string;
  author_display_name: string;
  author_avatar_url: string | null;
  status: PostStatus;
  is_anonymous: boolean;
  is_answered_prayer: boolean;
  body: string;
  reaction_count: number;
  prayer_count: number;
  expires_at: Date | null;
  edit_deadline: Date;
  created_at: Date;
  pinned_at: Date | null;
  /** Populated via a lateral join on the latest `moderator.hide` event.
   * All three fields arrive together or are all null. */
  hidden_by_id?: string | null;
  hidden_by_display_name?: string | null;
  hidden_source?: 'auto' | 'manual' | null;
}

export type HideSource = 'auto' | 'manual';

export interface HiddenByRef {
  id: string;
  display_name: string;
}

export interface PostDto {
  id: string;
  parent_id: string | null;
  author_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: PostStatus;
  is_anonymous: boolean;
  is_answered_prayer: boolean;
  body: string;
  reaction_count: number;
  prayer_count: number;
  expires_at: string | null;
  edit_deadline: string;
  created_at: string;
  /** ISO timestamp when this post was pinned; null when not pinned.
   * Drives the vesper card-pinned styling client-side. The pinner's identity
   * is stored on `posts.pinned_by` for audit but not projected through reads. */
  pinned_at: string | null;
  /** True when the caller authored this post. Computed from the real
   * author_id before anonymity masking, so clients can tell "mine vs
   * not mine" without seeing the identity of anonymous authors. */
  is_own_post: boolean;
  /** Only populated for moderator/super_user callers on hidden posts.
   * Null when source is 'auto' (auto-hidden after 2 flags, no actor). */
  hidden_by: HiddenByRef | null;
  /** Only populated for moderator/super_user callers on hidden posts. */
  hidden_source: HideSource | null;
  /** True when the author has been removed from this org. Computed via a
   * batch lookup against user_orgs (see services/membership-set.ts). When
   * the caller doesn't pass a memberSet, defaults to false. */
  is_former_member: boolean;
  is_tombstone?: boolean;
}

export interface Caller {
  role: UserRole;
}

export type { UserRole };

export interface ReactionSummary {
  count: number;
  mine: boolean;
}

export interface PrayerSummary {
  prayer_count: number;
  prayed: boolean;
}

export interface PostWithUpdatesResponse {
  post: PostDto;
  updates: PostDto[];
  reactions: Record<string, ReactionSummary>;
  prayer: PrayerSummary;
}

export function toPostDto(
  row: PostRow,
  caller: Caller,
  callerId?: string,
  formerMemberSet?: Set<string>,
): PostDto {
  const isPrivileged = isPrivilegedRole(caller.role);
  const isAuthor = callerId !== undefined && callerId === row.author_id;
  const hidden = row.status === 'hidden';
  // is_former_member only meaningful when caller passes a set; defaults false.
  const isFormerMember =
    formerMemberSet !== undefined && row.author_id !== null && !formerMemberSet.has(row.author_id);
  if (hidden && !isPrivileged && !isAuthor) {
    return {
      id: row.id,
      parent_id: row.parent_id,
      author_id: null,
      display_name: null,
      avatar_url: null,
      status: row.status,
      is_anonymous: false,
      is_answered_prayer: false,
      body: '',
      reaction_count: 0,
      prayer_count: 0,
      expires_at: null,
      edit_deadline: row.edit_deadline.toISOString(),
      created_at: row.created_at.toISOString(),
      pinned_at: null,
      is_own_post: false,
      hidden_by: null,
      hidden_source: null,
      is_former_member: false,
      is_tombstone: true,
    };
  }
  const canSeeAuthor = !row.is_anonymous || caller.role === 'super_user';
  const showHideAttribution = hidden && isPrivileged;
  const hiddenBy: HiddenByRef | null =
    showHideAttribution && row.hidden_by_id && row.hidden_by_display_name
      ? { id: row.hidden_by_id, display_name: row.hidden_by_display_name }
      : null;
  const hiddenSource: HideSource | null =
    showHideAttribution && (row.hidden_source === 'auto' || row.hidden_source === 'manual')
      ? row.hidden_source
      : null;
  return {
    id: row.id,
    parent_id: row.parent_id,
    author_id: canSeeAuthor ? row.author_id : null,
    display_name: canSeeAuthor ? row.author_display_name : null,
    avatar_url: canSeeAuthor ? row.author_avatar_url : null,
    status: row.status,
    is_anonymous: row.is_anonymous,
    is_answered_prayer: row.is_answered_prayer,
    body: row.body,
    reaction_count: row.reaction_count,
    prayer_count: row.prayer_count,
    expires_at: row.expires_at ? row.expires_at.toISOString() : null,
    edit_deadline: row.edit_deadline.toISOString(),
    created_at: row.created_at.toISOString(),
    pinned_at: row.pinned_at ? row.pinned_at.toISOString() : null,
    is_own_post: isAuthor,
    hidden_by: hiddenBy,
    hidden_source: hiddenSource,
    is_former_member: isFormerMember,
  };
}

const MIN_EXPIRES_MS = 24 * 3600_000;
const MAX_EXPIRES_MS = 365 * 24 * 3600_000;
// Allow a little slack on both ends so a client that picks exactly "now + 1 day"
// isn't rejected by the time its request lands on the server (network + clock skew).
const EXPIRES_TOLERANCE_MS = 60_000;
const EDIT_WINDOW_MS = 3600_000;
const DEFAULT_EXPIRY_MS = 30 * 24 * 3600_000;

export const zCreatePost = z.object({
  body: z.string().min(1).max(10_000),
  expires_at: z.string().datetime().optional(),
  is_anonymous: z.boolean().optional(),
  pin_duration_days: z
    .union([z.literal(1), z.literal(3), z.literal(7), z.literal(14), z.literal(30)])
    .optional(),
});
export type CreatePostInput = z.infer<typeof zCreatePost>;

function validateExpiresAt(iso: string | undefined, now: Date): Date {
  if (iso === undefined) return new Date(now.getTime() + DEFAULT_EXPIRY_MS);
  const d = new Date(iso);
  const delta = d.getTime() - now.getTime();
  if (
    delta < MIN_EXPIRES_MS - EXPIRES_TOLERANCE_MS ||
    delta > MAX_EXPIRES_MS + EXPIRES_TOLERANCE_MS
  ) {
    throw new ValidationError('expires_at must be within [now+1d, now+365d]');
  }
  return d;
}

export async function fetchPostRow(
  db: Kysely<Database> | Transaction<Database>,
  args: { postId: string; orgId: string },
): Promise<PostRow> {
  const row = await db
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
    .where('posts.id', '=', args.postId)
    .where('posts.org_id', '=', args.orgId)
    .executeTakeFirstOrThrow();
  return row as unknown as PostRow;
}

export async function publishPost(
  db: Kysely<Database>,
  args: { postId: string; orgId: string; callerId: string; callerRole: UserRole },
): Promise<PostDto> {
  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('posts')
      .select(['id', 'author_id', 'status'])
      .where('id', '=', args.postId)
      .where('org_id', '=', args.orgId)
      .executeTakeFirst();
    if (!existing) throw new NotFoundError('Post not found');
    if (existing.author_id !== args.callerId) throw new ForbiddenError();
    if (existing.status !== 'draft') throw new ForbiddenError('Post is not a draft');
    await trx
      .updateTable('posts')
      .set({ status: 'published' })
      .where('id', '=', args.postId)
      .where('org_id', '=', args.orgId)
      .execute();
    const row = await fetchPostRow(trx, { postId: args.postId, orgId: args.orgId });
    return toPostDto(row, { role: args.callerRole }, args.callerId);
  });
}

export interface DraftInput {
  body: string;
  expires_at?: string | undefined;
  is_anonymous?: boolean | undefined;
}

export async function getOwnDraft(
  db: Kysely<Database>,
  args: { userId: string; orgId: string; callerRole: UserRole },
): Promise<PostDto | null> {
  const existing = await db
    .selectFrom('posts')
    .select(['id'])
    .where('author_id', '=', args.userId)
    .where('org_id', '=', args.orgId)
    .where('status', '=', 'draft')
    .where('parent_id', 'is', null)
    .executeTakeFirst();
  if (!existing) return null;
  const row = await fetchPostRow(db, { postId: existing.id, orgId: args.orgId });
  return toPostDto(row, { role: args.callerRole }, args.userId);
}

export async function upsertOwnDraft(
  db: Kysely<Database>,
  args: { userId: string; orgId: string; callerRole: UserRole; input: DraftInput },
): Promise<PostDto> {
  const body = args.input.body;
  if (body.length > 10_000) {
    throw new ValidationError('body must be at most 10,000 characters');
  }
  const now = new Date();
  const isAnonymous = args.input.is_anonymous ?? false;
  // Drafts may be saved without a chosen expiry. If the client provides one,
  // validate it against the same [now+1d, now+365d] window as publish.
  const expiresAt =
    args.input.expires_at !== undefined ? validateExpiresAt(args.input.expires_at, now) : null;

  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('posts')
      .select(['id'])
      .where('author_id', '=', args.userId)
      .where('org_id', '=', args.orgId)
      .where('status', '=', 'draft')
      .where('parent_id', 'is', null)
      .executeTakeFirst();

    let postId: string;
    if (existing) {
      postId = existing.id;
      await trx
        .updateTable('posts')
        .set({
          body,
          is_anonymous: isAnonymous,
          expires_at: expiresAt,
        })
        .where('id', '=', postId)
        .where('org_id', '=', args.orgId)
        .execute();
    } else {
      postId = newId();
      await trx
        .insertInto('posts')
        .values({
          id: postId,
          org_id: args.orgId,
          author_id: args.userId,
          body,
          is_anonymous: isAnonymous,
          status: 'draft',
          expires_at: expiresAt,
          edit_deadline: new Date(now.getTime() + EDIT_WINDOW_MS),
        })
        .execute();
    }

    const row = await fetchPostRow(trx, { postId, orgId: args.orgId });
    return toPostDto(row, { role: args.callerRole }, args.userId);
  });
}

export const PIN_DAY_CHOICES = [1, 3, 7, 14, 30] as const;
export type PinDurationDays = (typeof PIN_DAY_CHOICES)[number];

export async function publishOwnDraft(
  db: Kysely<Database>,
  args: {
    userId: string;
    orgId: string;
    callerRole: UserRole;
    requiresPostApproval: boolean;
    pinDurationDays?: PinDurationDays;
  },
): Promise<PostDto> {
  const now = new Date();
  if (args.pinDurationDays !== undefined && !isPrivilegedRole(args.callerRole)) {
    throw new ForbiddenError('Only moderators can pin posts');
  }
  const goPending = args.requiresPostApproval && !isPrivilegedRole(args.callerRole);
  const targetStatus: PostStatus = goPending ? 'pending' : 'published';

  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('posts')
      .select(['id', 'body', 'is_anonymous', 'expires_at'])
      .where('author_id', '=', args.userId)
      .where('org_id', '=', args.orgId)
      .where('status', '=', 'draft')
      .where('parent_id', 'is', null)
      .executeTakeFirst();
    if (!existing) throw new NotFoundError('No draft to publish');
    if (!existing.body || existing.body.trim().length === 0) {
      throw new ValidationError('body is required to publish');
    }
    const expiresAt = existing.expires_at ?? new Date(now.getTime() + DEFAULT_EXPIRY_MS);

    // DELETE old draft + INSERT a fresh row (atomic: same trx).
    // Drafts can't accumulate child rows (comments/reactions/prayers all
    // gate on status='published'), so the DELETE has no FK side effects.
    // The new row gets a fresh UUIDv7 id and a fresh column-default
    // created_at, so both feed ordering and "X ago" displays reflect the
    // publish moment rather than the draft creation moment.
    const newPostId = newId();
    await trx
      .deleteFrom('posts')
      .where('id', '=', existing.id)
      .where('org_id', '=', args.orgId)
      .execute();
    await trx
      .insertInto('posts')
      .values({
        id: newPostId,
        org_id: args.orgId,
        author_id: args.userId,
        body: existing.body,
        is_anonymous: existing.is_anonymous,
        status: targetStatus,
        expires_at: expiresAt,
        edit_deadline: new Date(now.getTime() + EDIT_WINDOW_MS),
        ...(args.pinDurationDays !== undefined
          ? {
              pinned_at: now,
              pin_until: new Date(now.getTime() + args.pinDurationDays * 86_400_000),
              pinned_by: args.userId,
            }
          : {}),
      })
      .execute();

    if (goPending) {
      await writePostEvent(trx, {
        kind: 'post.submitted',
        orgId: args.orgId,
        postId: newPostId,
        actorId: args.userId,
        payload: {},
      });
    }
    if (args.pinDurationDays !== undefined) {
      await writePostEvent(trx, {
        kind: 'post.pinned',
        orgId: args.orgId,
        postId: newPostId,
        actorId: args.userId,
        payload: {
          pin_until: new Date(now.getTime() + args.pinDurationDays * 86_400_000).toISOString(),
          pinned_by: args.userId,
        },
      });
    }

    const row = await fetchPostRow(trx, { postId: newPostId, orgId: args.orgId });
    return toPostDto(row, { role: args.callerRole }, args.userId);
  });
}

export async function getPostWithUpdates(
  db: Kysely<Database>,
  args: { postId: string; orgId: string; callerId: string; callerRole: UserRole },
): Promise<PostWithUpdatesResponse> {
  const parentRow = await db
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
    .where('posts.id', '=', args.postId)
    .where('posts.org_id', '=', args.orgId)
    .executeTakeFirst();
  if (!parentRow) throw new NotFoundError('Post not found');
  const r = parentRow as unknown as PostRow;
  if (
    r.status === 'archived' &&
    r.author_id !== args.callerId &&
    args.callerRole !== 'super_user'
  ) {
    throw new NotFoundError('Post not found');
  }
  // Hide attribution for privileged viewers on a hidden post.
  const isPrivileged = isPrivilegedRole(args.callerRole);
  if (isPrivileged && r.status === 'hidden') {
    const hideInfo = await fetchHideInfo(db, [r.id], args.orgId);
    const info = hideInfo.get(r.id);
    if (info) {
      r.hidden_by_id = info.actorId;
      r.hidden_by_display_name = info.displayName;
      r.hidden_source = info.source;
    }
  }
  const [updates, reactionRows, prayerRows] = await Promise.all([
    db
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
      .where('posts.parent_id', '=', args.postId)
      .orderBy('posts.created_at', 'asc')
      .execute(),
    db
      .selectFrom('reactions')
      .select([
        'emoji',
        (eb) => eb.fn.count<number>('id').as('count'),
        (eb) => sql<boolean>`bool_or(${eb.ref('author_id')} = ${args.callerId})`.as('mine'),
      ])
      .where('target_type', '=', 'post')
      .where('target_id', '=', args.postId)
      .groupBy('emoji')
      .execute(),
    db
      .selectFrom('prayers')
      .select([
        (eb) => eb.fn.count<number>('id').as('prayer_count'),
        (eb) => sql<boolean>`bool_or(${eb.ref('user_id')} = ${args.callerId})`.as('prayed'),
      ])
      .where('post_id', '=', args.postId)
      .executeTakeFirstOrThrow(),
  ]);
  const reactions: Record<string, ReactionSummary> = {};
  for (const row of reactionRows) {
    reactions[row.emoji] = { count: Number(row.count), mine: row.mine };
  }

  const updateRows = updates as unknown as PostRow[];
  const detailAuthorIds = Array.from(
    new Set(
      [r.author_id, ...updateRows.map((u) => u.author_id)].filter(
        (id): id is string => id !== null,
      ),
    ),
  );
  const memberSet = await fetchMemberSet(db, args.orgId, detailAuthorIds);

  return {
    post: toPostDto(r, { role: args.callerRole }, args.callerId, memberSet),
    updates: updateRows.map((u) =>
      toPostDto(u, { role: args.callerRole }, args.callerId, memberSet),
    ),
    reactions,
    prayer: {
      prayer_count: Number(prayerRows.prayer_count),
      prayed: prayerRows.prayed ?? false,
    },
  };
}

export async function createPost(
  db: Kysely<Database>,
  input: {
    authorId: string;
    orgId: string;
    callerRole: UserRole;
    body: string;
    expiresAt?: string;
    isAnonymous?: boolean;
    pinDurationDays?: PinDurationDays;
  },
): Promise<PostDto> {
  const now = new Date();
  const expiresAt = validateExpiresAt(input.expiresAt, now);
  if (input.pinDurationDays !== undefined && !isPrivilegedRole(input.callerRole)) {
    throw new ForbiddenError('Only moderators can pin posts');
  }
  const id = newId();
  return db.transaction().execute(async (trx) => {
    await trx
      .insertInto('posts')
      .values({
        id,
        org_id: input.orgId,
        author_id: input.authorId,
        body: input.body,
        is_anonymous: input.isAnonymous,
        status: 'draft',
        expires_at: expiresAt,
        edit_deadline: new Date(now.getTime() + EDIT_WINDOW_MS),
        ...(input.pinDurationDays !== undefined
          ? {
              pinned_at: now,
              pin_until: new Date(now.getTime() + input.pinDurationDays * 86_400_000),
              pinned_by: input.authorId,
            }
          : {}),
      })
      .execute();
    if (input.pinDurationDays !== undefined) {
      await writePostEvent(trx, {
        kind: 'post.pinned',
        orgId: input.orgId,
        postId: id,
        actorId: input.authorId,
        payload: {
          pin_until: new Date(now.getTime() + input.pinDurationDays * 86_400_000).toISOString(),
          pinned_by: input.authorId,
        },
      });
    }
    const row = await fetchPostRow(trx, { postId: id, orgId: input.orgId });
    return toPostDto(row, { role: input.callerRole }, input.authorId);
  });
}

export const zEditPost = z
  .object({
    body: z.string().min(1).max(10_000).optional(),
    expires_at: z.string().datetime().optional(),
  })
  .refine((v) => v.body !== undefined || v.expires_at !== undefined, {
    message: 'at least one of body, expires_at required',
  });
export type EditPostInput = z.infer<typeof zEditPost>;

export async function editPost(
  db: Kysely<Database>,
  args: {
    postId: string;
    orgId: string;
    callerId: string;
    callerRole: UserRole;
    body?: string;
    expiresAt?: string;
  },
): Promise<PostDto> {
  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('posts')
      .select(['id', 'author_id', 'edit_deadline', 'status'])
      .where('id', '=', args.postId)
      .where('org_id', '=', args.orgId)
      .executeTakeFirst();
    if (!existing) throw new NotFoundError('Post not found');
    if (existing.author_id !== args.callerId) throw new ForbiddenError();
    if (existing.status === 'archived') throw new ForbiddenError('Archived post cannot be edited');
    // Drafts are not subject to the edit-deadline window: the user can come
    // back any time and keep editing. The 1-hour window only starts at publish.
    if (existing.status !== 'draft' && existing.edit_deadline.getTime() <= Date.now()) {
      throw new EditDeadlinePassedError();
    }

    const update: { body?: string; expires_at?: Date } = {};
    const fields: ('body' | 'expires_at')[] = [];
    if (args.body !== undefined) {
      update.body = args.body;
      fields.push('body');
    }
    if (args.expiresAt !== undefined) {
      update.expires_at = validateExpiresAt(args.expiresAt, new Date());
      fields.push('expires_at');
    }
    await trx
      .updateTable('posts')
      .set(update)
      .where('id', '=', args.postId)
      .where('org_id', '=', args.orgId)
      .execute();
    const row = await fetchPostRow(trx, { postId: args.postId, orgId: args.orgId });
    return toPostDto(row, { role: args.callerRole }, args.callerId);
  });
}

export const zCreateUpdate = z.object({
  body: z.string().min(1).max(10_000),
  is_answered_prayer: z.boolean().optional(),
});
export type CreateUpdateInput = z.infer<typeof zCreateUpdate>;

export const zEditUpdate = z
  .object({
    body: z.string().min(1).max(10_000).optional(),
    is_answered_prayer: z.boolean().optional(),
  })
  .refine((v) => v.body !== undefined || v.is_answered_prayer !== undefined, {
    message: 'at least one of body, is_answered_prayer required',
  });

export async function createUpdate(
  db: Kysely<Database>,
  args: {
    parentId: string;
    orgId: string;
    callerId: string;
    callerRole: UserRole;
    body: string;
    isAnsweredPrayer?: boolean;
  },
): Promise<PostDto> {
  return db.transaction().execute(async (trx) => {
    const parent = await trx
      .selectFrom('posts')
      .select(['id', 'author_id', 'status', 'is_anonymous', 'parent_id'])
      .where('id', '=', args.parentId)
      .where('org_id', '=', args.orgId)
      .executeTakeFirst();
    if (!parent) throw new NotFoundError('Post not found');
    if (parent.parent_id !== null) throw new ForbiddenError('Cannot update an update');
    if (parent.author_id !== args.callerId) throw new ForbiddenError();
    if (parent.status === 'archived') throw new ForbiddenError('Parent is archived');

    const now = new Date();
    const id = newId();
    await trx
      .insertInto('posts')
      .values({
        id,
        org_id: args.orgId,
        author_id: args.callerId,
        parent_id: parent.id,
        body: args.body,
        status: 'published',
        is_anonymous: parent.is_anonymous,
        is_answered_prayer: args.isAnsweredPrayer ?? false,
        edit_deadline: new Date(now.getTime() + EDIT_WINDOW_MS),
        expires_at: null,
      })
      .execute();
    if (args.isAnsweredPrayer === true) {
      await trx
        .updateTable('posts')
        .set({ is_answered_prayer: true })
        .where('id', '=', parent.id)
        .where('org_id', '=', args.orgId)
        .execute();
    }
    await writePostEvent(trx, {
      kind: 'post.update_created',
      orgId: args.orgId,
      postId: id,
      actorId: args.callerId,
      payload: { parent_id: parent.id, is_answered_prayer: args.isAnsweredPrayer ?? false },
    });
    const row = await fetchPostRow(trx, { postId: id, orgId: args.orgId });
    return toPostDto(row, { role: args.callerRole }, args.callerId);
  });
}

export async function editUpdate(
  db: Kysely<Database>,
  args: {
    parentId: string;
    updateId: string;
    orgId: string;
    callerId: string;
    callerRole: UserRole;
    body?: string;
    isAnsweredPrayer?: boolean;
  },
): Promise<PostDto> {
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('posts')
      .select(['id', 'author_id', 'parent_id', 'edit_deadline', 'status'])
      .where('id', '=', args.updateId)
      .where('org_id', '=', args.orgId)
      .executeTakeFirst();
    if (!row || row.parent_id !== args.parentId) throw new NotFoundError('Update not found');
    if (row.author_id !== args.callerId) throw new ForbiddenError();
    if (row.edit_deadline.getTime() <= Date.now()) throw new EditDeadlinePassedError();

    const update: { body?: string; is_answered_prayer?: boolean } = {};
    const fields: ('body' | 'expires_at')[] = [];
    if (args.body !== undefined) {
      update.body = args.body;
      fields.push('body');
    }
    if (args.isAnsweredPrayer !== undefined) {
      update.is_answered_prayer = args.isAnsweredPrayer;
    }
    await trx
      .updateTable('posts')
      .set(update)
      .where('id', '=', args.updateId)
      .where('org_id', '=', args.orgId)
      .execute();
    if (args.isAnsweredPrayer === true) {
      await trx
        .updateTable('posts')
        .set({ is_answered_prayer: true })
        .where('id', '=', args.parentId)
        .where('org_id', '=', args.orgId)
        .execute();
    }
    const out = await fetchPostRow(trx, { postId: args.updateId, orgId: args.orgId });
    return toPostDto(out, { role: args.callerRole }, args.callerId);
  });
}

async function listByStatus(
  db: Kysely<Database>,
  args: { authorId: string; orgId: string; status: 'draft' | 'archived'; callerRole: UserRole },
): Promise<PostDto[]> {
  const rows = await db
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
    .where('posts.author_id', '=', args.authorId)
    .where('posts.org_id', '=', args.orgId)
    .where('posts.status', '=', args.status)
    .where('posts.parent_id', 'is', null)
    .orderBy('posts.id', 'desc')
    .execute();
  return (rows as unknown as PostRow[]).map((r) =>
    toPostDto(r, { role: args.callerRole }, args.authorId),
  );
}

export async function listArchive(
  db: Kysely<Database>,
  args: { authorId: string; orgId: string; callerRole: UserRole },
): Promise<PostDto[]> {
  return listByStatus(db, { ...args, status: 'archived' });
}

export async function archivePost(
  db: Kysely<Database>,
  args: { postId: string; orgId: string; callerId: string; reason: 'author' | 'expiry' },
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('posts')
      .select(['id', 'author_id', 'status'])
      .where('id', '=', args.postId)
      .where('org_id', '=', args.orgId)
      .executeTakeFirst();
    if (!existing) throw new NotFoundError('Post not found');
    if (args.reason === 'author' && existing.author_id !== args.callerId) {
      throw new ForbiddenError();
    }
    if (existing.status === 'archived') return;
    await trx
      .updateTable('posts')
      .set({ status: 'archived' })
      .where('id', '=', args.postId)
      .where('org_id', '=', args.orgId)
      .execute();
  });
}
