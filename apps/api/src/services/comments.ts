import type { Database, UserRole } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely, Transaction } from 'kysely';
import { sql } from 'kysely';

import { isPrivilegedRole } from '../lib/roles.js';
import {
  EditDeadlinePassedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../middleware/error.js';

import { writeCommentEvent } from './events.js';

export interface CommentRow {
  id: string;
  post_id: string;
  author_id: string;
  author_display_name: string;
  author_avatar_url: string | null;
  participant_id: string;
  body: string;
  reaction_count: number;
  is_hidden: boolean;
  flag_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface CommentReactionSummary {
  count: number;
  mine: boolean;
}

export interface CommentDto {
  id: string;
  post_id: string;
  author_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_anonymous_author: boolean;
  participant_id: string;
  body: string;
  reaction_count: number;
  is_hidden: boolean;
  flag_count: number;
  created_at: string;
  updated_at: string;
  reactions: Record<string, CommentReactionSummary>;
  is_tombstone?: boolean;
}

export interface Caller {
  role: UserRole;
}

export interface PostContext {
  postAuthorId: string;
  postIsAnonymous: boolean;
  callerId: string;
}

/** Return a DTO if the caller is allowed to see this row, otherwise null. */
export function toCommentDto(
  row: CommentRow,
  caller: Caller,
  ctx: PostContext,
  reactions: Record<string, CommentReactionSummary> = {},
): CommentDto | null {
  const isCallerPrivileged = isPrivilegedRole(caller.role);
  const isCallerPostAuthor = ctx.callerId === ctx.postAuthorId;
  const isCallerParticipant = ctx.callerId === row.participant_id;
  const isCallerCommentAuthor = ctx.callerId === row.author_id;

  const visible =
    isCallerPrivileged || isCallerPostAuthor || isCallerParticipant || isCallerCommentAuthor;
  if (!visible) return null;

  if (row.is_hidden && !isCallerPrivileged && !isCallerCommentAuthor) {
    return {
      id: row.id,
      post_id: row.post_id,
      author_id: null,
      display_name: null,
      avatar_url: null,
      is_anonymous_author: false,
      participant_id: row.participant_id,
      body: '',
      reaction_count: 0,
      is_hidden: true,
      flag_count: 0,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      reactions: {},
      is_tombstone: true,
    };
  }

  // Mask the post author's self-reply on an anon post from the commenter.
  const rowIsPostAuthorReply = row.author_id === ctx.postAuthorId;
  const maskPostAuthor =
    ctx.postIsAnonymous &&
    rowIsPostAuthorReply &&
    !isCallerPostAuthor &&
    caller.role !== 'super_user';

  return {
    id: row.id,
    post_id: row.post_id,
    author_id: maskPostAuthor ? null : row.author_id,
    display_name: maskPostAuthor ? null : row.author_display_name,
    avatar_url: maskPostAuthor ? null : row.author_avatar_url,
    is_anonymous_author: maskPostAuthor,
    participant_id: row.participant_id,
    body: row.body,
    reaction_count: row.reaction_count,
    is_hidden: row.is_hidden,
    flag_count: row.flag_count,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    reactions,
  };
}

const COMMENT_EDIT_WINDOW_MS = 3600_000;
const COMMENT_BODY_MAX = 2_000;
const COMMENT_PREVIEW_MAX = 120;

export interface CreateCommentArgs {
  postId: string;
  orgId: string;
  callerId: string;
  callerRole: UserRole;
  body: string;
  participantId?: string;
}

export async function createComment(
  db: Kysely<Database>,
  args: CreateCommentArgs,
): Promise<CommentDto> {
  if (args.body.trim().length === 0 || args.body.length > COMMENT_BODY_MAX) {
    throw new ValidationError('comment body must be 1–2000 chars');
  }
  return db.transaction().execute(async (trx) => {
    const post = await trx
      .selectFrom('posts')
      .select(['id', 'author_id', 'status', 'is_anonymous'])
      .where('id', '=', args.postId)
      .where('org_id', '=', args.orgId)
      .executeTakeFirst();
    if (!post || post.status !== 'published') throw new NotFoundError('Post not found');

    const isAuthor = post.author_id === args.callerId;
    const isPrivileged = isPrivilegedRole(args.callerRole);

    let participantId = args.participantId ?? args.callerId;

    if (isAuthor) {
      if (!args.participantId) {
        throw new ValidationError('participant_id required when the caller is the post author');
      }
      if (args.participantId !== args.callerId) {
        const existing = await trx
          .selectFrom('comments')
          .select('id')
          .where('post_id', '=', args.postId)
          .where('org_id', '=', args.orgId)
          .where('participant_id', '=', args.participantId)
          .limit(1)
          .executeTakeFirst();
        if (!existing) {
          throw new ValidationError('participant_id does not match any thread on this post');
        }
      }
      participantId = args.participantId;
    } else if (isPrivileged && args.participantId !== undefined) {
      // Privileged caller explicitly replying into a named thread — validate it exists.
      if (args.participantId !== args.callerId) {
        const existing = await trx
          .selectFrom('comments')
          .select('id')
          .where('post_id', '=', args.postId)
          .where('org_id', '=', args.orgId)
          .where('participant_id', '=', args.participantId)
          .limit(1)
          .executeTakeFirst();
        if (!existing) {
          throw new ValidationError('participant_id does not match any thread on this post');
        }
      }
      participantId = args.participantId;
    }

    const id = newId();
    await trx
      .insertInto('comments')
      .values({
        id,
        org_id: args.orgId,
        post_id: args.postId,
        author_id: args.callerId,
        participant_id: participantId,
        body: args.body,
      })
      .execute();

    const authorRow = await trx
      .selectFrom('users')
      .select(['id', 'display_name'])
      .where('id', '=', args.callerId)
      .executeTakeFirstOrThrow();

    const preview = args.body.slice(0, COMMENT_PREVIEW_MAX);
    await writeCommentEvent(trx, {
      kind: 'comment.created',
      orgId: args.orgId,
      postId: args.postId,
      actorId: args.callerId,
      payload: {
        comment_id: id,
        post_id: args.postId,
        post_author_id: post.author_id,
        commenter_id: args.callerId,
        commenter_display_name: authorRow.display_name,
        preview,
      },
    });

    const row = await fetchCommentRow(trx, id);
    const dto = toCommentDto(
      row,
      { role: args.callerRole },
      {
        postAuthorId: post.author_id,
        postIsAnonymous: post.is_anonymous,
        callerId: args.callerId,
      },
    );
    return dto!;
  });
}

export interface EditCommentArgs {
  commentId: string;
  orgId: string;
  callerId: string;
  callerRole: UserRole;
  body: string;
}

export async function editComment(
  db: Kysely<Database>,
  args: EditCommentArgs,
): Promise<CommentDto> {
  if (args.body.trim().length === 0 || args.body.length > COMMENT_BODY_MAX) {
    throw new ValidationError('comment body must be 1–2000 chars');
  }
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('comments')
      .innerJoin('posts', 'posts.id', 'comments.post_id')
      .select([
        'comments.id',
        'comments.author_id',
        'comments.created_at',
        'comments.post_id',
        'posts.author_id as post_author_id',
        'posts.is_anonymous as post_is_anonymous',
      ])
      .where('comments.id', '=', args.commentId)
      .where('comments.org_id', '=', args.orgId)
      .executeTakeFirst();
    if (!row) throw new NotFoundError('Comment not found');
    if (row.author_id !== args.callerId) throw new ForbiddenError();
    if ((row.created_at as unknown as Date).getTime() + COMMENT_EDIT_WINDOW_MS <= Date.now()) {
      throw new EditDeadlinePassedError();
    }

    await trx
      .updateTable('comments')
      .set({ body: args.body, updated_at: new Date() as never })
      .where('id', '=', args.commentId)
      .where('org_id', '=', args.orgId)
      .execute();

    const fresh = await fetchCommentRow(trx, args.commentId);
    return toCommentDto(
      fresh,
      { role: args.callerRole },
      {
        postAuthorId: row.post_author_id,
        postIsAnonymous: row.post_is_anonymous,
        callerId: args.callerId,
      },
    )!;
  });
}

export interface HideCommentArgs {
  commentId: string;
  orgId: string;
  callerId: string;
  callerRole: UserRole;
}

export async function hideComment(db: Kysely<Database>, args: HideCommentArgs): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('comments')
      .select(['id', 'author_id', 'post_id'])
      .where('id', '=', args.commentId)
      .where('org_id', '=', args.orgId)
      .executeTakeFirst();
    if (!row) throw new NotFoundError('Comment not found');
    const isOwn = row.author_id === args.callerId;
    const isPrivileged = isPrivilegedRole(args.callerRole);
    if (!isOwn && !isPrivileged) throw new ForbiddenError();

    await trx
      .updateTable('comments')
      .set({ is_hidden: true, updated_at: new Date() as never })
      .where('id', '=', args.commentId)
      .where('org_id', '=', args.orgId)
      .execute();
  });
}

export interface ListCommentsArgs {
  postId: string;
  orgId: string;
  callerId: string;
  callerRole: UserRole;
}

export interface CommentThread {
  participant_id: string;
  participant_display_name: string | null;
  comments: CommentDto[];
}

export async function listCommentsForPost(
  db: Kysely<Database>,
  args: ListCommentsArgs,
): Promise<{ threads: CommentThread[] }> {
  const post = await db
    .selectFrom('posts')
    .select(['id', 'author_id', 'status', 'is_anonymous'])
    .where('id', '=', args.postId)
    .where('org_id', '=', args.orgId)
    .executeTakeFirst();
  if (!post) throw new NotFoundError('Post not found');

  const rows = (await db
    .selectFrom('comments')
    .innerJoin('users as authors', 'authors.id', 'comments.author_id')
    .innerJoin('users as participants', 'participants.id', 'comments.participant_id')
    .select([
      'comments.id',
      'comments.post_id',
      'comments.author_id',
      'authors.display_name as author_display_name',
      'authors.avatar_url as author_avatar_url',
      'comments.participant_id',
      'participants.display_name as participant_display_name',
      'comments.body',
      'comments.reaction_count',
      'comments.is_hidden',
      'comments.flag_count',
      'comments.created_at',
      'comments.updated_at',
    ])
    .where('comments.post_id', '=', args.postId)
    .where('comments.org_id', '=', args.orgId)
    .orderBy('comments.created_at', 'asc')
    .execute()) as unknown as (CommentRow & { participant_display_name: string })[];

  const commentIds = rows.map((r) => r.id);
  const reactionAggregates: Record<string, Record<string, CommentReactionSummary>> = {};
  if (commentIds.length > 0) {
    const agg = await db
      .selectFrom('reactions')
      .select([
        'target_id',
        'emoji',
        (eb) => eb.fn.count<number>('id').as('count'),
        (eb) => sql<boolean>`bool_or(${eb.ref('author_id')} = ${args.callerId})`.as('mine'),
      ])
      .where('target_type', '=', 'comment')
      .where('target_id', 'in', commentIds)
      .groupBy(['target_id', 'emoji'])
      .execute();
    for (const row of agg) {
      if (!reactionAggregates[row.target_id]) reactionAggregates[row.target_id] = {};
      reactionAggregates[row.target_id]![row.emoji] = {
        count: Number(row.count),
        mine: row.mine,
      };
    }
  }

  const visibleByParticipant = new Map<string, CommentThread>();
  for (const row of rows) {
    const dto = toCommentDto(
      row,
      { role: args.callerRole },
      {
        postAuthorId: post.author_id,
        postIsAnonymous: post.is_anonymous,
        callerId: args.callerId,
      },
      reactionAggregates[row.id] ?? {},
    );
    if (!dto) continue;
    const existing = visibleByParticipant.get(row.participant_id);
    if (existing) {
      existing.comments.push(dto);
    } else {
      visibleByParticipant.set(row.participant_id, {
        participant_id: row.participant_id,
        participant_display_name: row.participant_display_name,
        comments: [dto],
      });
    }
  }
  return { threads: [...visibleByParticipant.values()] };
}

export async function fetchCommentRow(
  db: Kysely<Database> | Transaction<Database>,
  commentId: string,
): Promise<CommentRow> {
  const row = await db
    .selectFrom('comments')
    .innerJoin('users', 'users.id', 'comments.author_id')
    .select([
      'comments.id',
      'comments.post_id',
      'comments.author_id',
      'users.display_name as author_display_name',
      'users.avatar_url as author_avatar_url',
      'comments.participant_id',
      'comments.body',
      'comments.reaction_count',
      'comments.is_hidden',
      'comments.flag_count',
      'comments.created_at',
      'comments.updated_at',
    ])
    .where('comments.id', '=', commentId)
    .executeTakeFirstOrThrow();
  return row as unknown as CommentRow;
}
