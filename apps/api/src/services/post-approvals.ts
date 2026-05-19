import type { Database, UserRole } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import { isPrivilegedRole } from '../lib/roles.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../middleware/error.js';

import { writePostEvent } from './events.js';
import { fetchMemberSet } from './membership-set.js';
import { fetchPostRow, toPostDto, type PostDto, type PostRow } from './posts.js';

const REJECT_NOTE_MAX = 500;

function requireModerator(role: UserRole): void {
  if (!isPrivilegedRole(role)) throw new ForbiddenError();
}

export interface ListApprovalsInput {
  orgId: string;
  callerId: string;
  callerRole: UserRole;
  limit: number;
}

export interface ListApprovalsItem extends PostDto {
  skipped_by_me: boolean;
}

export interface ListApprovalsResult {
  items: ListApprovalsItem[];
}

export async function listApprovals(
  db: Kysely<Database>,
  input: ListApprovalsInput,
): Promise<ListApprovalsResult> {
  requireModerator(input.callerRole);
  const rows = await db
    .selectFrom('posts')
    .innerJoin('users', 'users.id', 'posts.author_id')
    .leftJoin('mod_post_skips as s', (join) =>
      join.onRef('s.post_id', '=', 'posts.id').on('s.moderator_id', '=', input.callerId),
    )
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
      sql<boolean>`s.moderator_id IS NOT NULL`.as('skipped_by_me'),
      's.skipped_at as skipped_at',
    ])
    .where('posts.org_id', '=', input.orgId)
    .where('posts.status', '=', 'pending')
    .orderBy(sql`(s.moderator_id IS NOT NULL)`, 'asc') // false first → un-skipped on top
    .orderBy(sql`COALESCE(s.skipped_at, posts.created_at)`, 'asc')
    .limit(input.limit)
    .execute();

  const authorIds = Array.from(
    new Set(rows.map((r) => r.author_id).filter((id): id is string => id !== null)),
  );
  const memberSet = await fetchMemberSet(db, input.orgId, authorIds);

  const items = (rows as unknown as (PostRow & { skipped_by_me: boolean })[]).map((r) => {
    const dto = toPostDto(r, { role: input.callerRole }, input.callerId, memberSet);
    return { ...dto, skipped_by_me: r.skipped_by_me };
  });
  return { items };
}

export interface ApprovePostInput {
  postId: string;
  orgId: string;
  callerId: string;
  callerRole: UserRole;
}

export async function approvePost(db: Kysely<Database>, input: ApprovePostInput): Promise<PostDto> {
  requireModerator(input.callerRole);
  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('posts')
      .select(['id', 'author_id', 'body', 'is_anonymous', 'expires_at', 'status'])
      .where('id', '=', input.postId)
      .where('org_id', '=', input.orgId)
      .forUpdate()
      .executeTakeFirst();
    if (!existing || existing.status !== 'pending') throw new NotFoundError('Post not found');
    if (existing.author_id === input.callerId) {
      throw new ForbiddenError('cannot approve your own submission');
    }

    const now = new Date();
    const newPostId = newId();
    await trx
      .deleteFrom('posts')
      .where('id', '=', existing.id)
      .where('org_id', '=', input.orgId)
      .execute();
    await trx
      .insertInto('posts')
      .values({
        id: newPostId,
        org_id: input.orgId,
        author_id: existing.author_id,
        body: existing.body,
        is_anonymous: existing.is_anonymous,
        status: 'published',
        expires_at: existing.expires_at,
        edit_deadline: new Date(now.getTime() + 3600_000),
        moderated_by: input.callerId,
        moderated_at: now,
      })
      .execute();
    await writePostEvent(trx, {
      kind: 'post.approved',
      orgId: input.orgId,
      postId: newPostId,
      actorId: input.callerId,
      payload: {},
    });
    const row = await fetchPostRow(trx, { postId: newPostId, orgId: input.orgId });
    return toPostDto(row, { role: input.callerRole }, input.callerId);
  });
}

export interface SkipReviewInput {
  postId: string;
  orgId: string;
  callerId: string;
  callerRole: UserRole;
}

export async function skipPostReview(db: Kysely<Database>, input: SkipReviewInput): Promise<void> {
  requireModerator(input.callerRole);
  await db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('posts')
      .select(['id', 'status'])
      .where('id', '=', input.postId)
      .where('org_id', '=', input.orgId)
      .executeTakeFirst();
    if (!existing || existing.status !== 'pending') throw new NotFoundError('Post not found');
    await sql`
      INSERT INTO mod_post_skips (post_id, moderator_id, org_id, skipped_at)
      VALUES (${input.postId}, ${input.callerId}, ${input.orgId}, NOW())
      ON CONFLICT (post_id, moderator_id)
      DO UPDATE SET skipped_at = NOW()
    `.execute(trx);
  });
}

export async function unskipPostReview(
  db: Kysely<Database>,
  input: SkipReviewInput,
): Promise<void> {
  requireModerator(input.callerRole);
  await db
    .deleteFrom('mod_post_skips')
    .where('post_id', '=', input.postId)
    .where('moderator_id', '=', input.callerId)
    .execute();
}

export interface RejectPostInput {
  postId: string;
  orgId: string;
  callerId: string;
  callerRole: UserRole;
  note?: string;
}

export async function rejectPost(db: Kysely<Database>, input: RejectPostInput): Promise<PostDto> {
  requireModerator(input.callerRole);
  const note = input.note?.trim() ? input.note.trim() : null;
  if (note !== null && note.length > REJECT_NOTE_MAX) {
    throw new ValidationError(`note must be ${REJECT_NOTE_MAX} characters or fewer`);
  }
  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('posts')
      .select(['id', 'author_id', 'body', 'status'])
      .where('id', '=', input.postId)
      .where('org_id', '=', input.orgId)
      .forUpdate()
      .executeTakeFirst();
    if (!existing || existing.status !== 'pending') throw new NotFoundError('Post not found');
    if (existing.author_id === input.callerId) {
      throw new ForbiddenError('cannot reject your own submission');
    }
    const now = new Date();
    await trx
      .updateTable('posts')
      .set({
        status: 'rejected',
        moderation_note: note,
        moderated_by: input.callerId,
        moderated_at: now,
      })
      .where('id', '=', input.postId)
      .where('org_id', '=', input.orgId)
      .execute();
    await writePostEvent(trx, {
      kind: 'post.rejected',
      orgId: input.orgId,
      postId: input.postId,
      actorId: input.callerId,
      payload: {
        moderation_note: note,
        moderated_by: input.callerId,
        body_preview: existing.body.slice(0, 120),
      },
    });
    const row = await fetchPostRow(trx, { postId: input.postId, orgId: input.orgId });
    return toPostDto(row, { role: input.callerRole }, input.callerId);
  });
}
