import type { Database, ReactionTargetType, UserRole } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';

import { AppError, ForbiddenError, NotFoundError } from '../middleware/error.js';

import { writeFlagEvent } from './events.js';

class SelfFlagError extends AppError {
  constructor() {
    super(400, 'SELF_FLAG', 'Cannot flag your own content');
  }
}

class AlreadyFlaggedError extends AppError {
  constructor() {
    super(409, 'ALREADY_FLAGGED', 'You have already flagged this');
  }
}

export interface CreateFlagInput {
  callerId: string;
  orgId: string;
  targetType: ReactionTargetType;
  postId: string;
  targetId: string;
  reason: string;
  note?: string;
}

export interface CreateFlagResult {
  flag_count: number;
}

export async function createFlag(
  db: Kysely<Database>,
  input: CreateFlagInput,
): Promise<CreateFlagResult> {
  return db.transaction().execute(async (trx) => {
    if (input.targetType === 'post') {
      const post = await trx
        .selectFrom('posts')
        .select(['id', 'author_id', 'status', 'flag_count'])
        .where('id', '=', input.targetId)
        .where('org_id', '=', input.orgId)
        .executeTakeFirst();
      if (!post) throw new NotFoundError('Post not found');
      if (post.author_id === input.callerId) throw new SelfFlagError();
      if (post.status === 'hidden') {
        return { flag_count: post.flag_count };
      }

      const id = newId();
      try {
        await trx
          .insertInto('flags')
          .values({
            id,
            org_id: input.orgId,
            target_type: 'post',
            target_id: input.targetId,
            flagger_id: input.callerId,
            reason: input.reason,
            note: input.note ?? null,
          })
          .execute();
      } catch (err) {
        const pgErr = err as { code?: string };
        if (pgErr.code === '23505') throw new AlreadyFlaggedError();
        throw err;
      }

      await writeFlagEvent(trx, {
        kind: 'flag.created',
        orgId: input.orgId,
        postId: input.postId,
        actorId: input.callerId,
        flagId: id,
        targetType: 'post',
        targetId: input.targetId,
        reason: input.reason,
        ...(input.note !== undefined ? { note: input.note } : {}),
      });

      return { flag_count: post.flag_count };
    }

    // comment target
    const comment = await trx
      .selectFrom('comments')
      .select(['id', 'post_id', 'author_id', 'is_hidden', 'flag_count'])
      .where('id', '=', input.targetId)
      .where('org_id', '=', input.orgId)
      .executeTakeFirst();
    if (!comment) throw new NotFoundError('Comment not found');
    if (comment.post_id !== input.postId) throw new NotFoundError('Comment not found');
    if (comment.author_id === input.callerId) throw new SelfFlagError();
    if (comment.is_hidden) {
      return { flag_count: comment.flag_count };
    }

    const id = newId();
    try {
      await trx
        .insertInto('flags')
        .values({
          id,
          org_id: input.orgId,
          target_type: 'comment',
          target_id: input.targetId,
          flagger_id: input.callerId,
          reason: input.reason,
          note: input.note ?? null,
        })
        .execute();
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') throw new AlreadyFlaggedError();
      throw err;
    }

    await writeFlagEvent(trx, {
      kind: 'flag.created',
      orgId: input.orgId,
      postId: input.postId,
      actorId: input.callerId,
      flagId: id,
      targetType: 'comment',
      targetId: input.targetId,
      reason: input.reason,
      ...(input.note !== undefined ? { note: input.note } : {}),
    });

    return { flag_count: comment.flag_count };
  });
}

export interface DismissFlagsInput {
  callerId: string;
  callerRole: UserRole;
  orgId: string;
  targetType: ReactionTargetType;
  postId: string;
  targetId: string;
}

export interface DismissFlagsResult {
  dismissed: number;
}

export async function dismissFlags(
  db: Kysely<Database>,
  input: DismissFlagsInput,
): Promise<DismissFlagsResult> {
  if (input.callerRole !== 'moderator' && input.callerRole !== 'super_user') {
    throw new ForbiddenError();
  }
  return db.transaction().execute(async (trx) => {
    const resolved = await trx
      .updateTable('flags')
      .set({ resolved_at: new Date(), resolved_by_id: input.callerId })
      .where('org_id', '=', input.orgId)
      .where('target_type', '=', input.targetType)
      .where('target_id', '=', input.targetId)
      .where('resolved_at', 'is', null)
      .returning('id')
      .execute();
    for (const row of resolved) {
      await writeFlagEvent(trx, {
        kind: 'flag.resolved',
        orgId: input.orgId,
        postId: input.postId,
        actorId: input.callerId,
        flagId: row.id,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: '',
      });
    }
    return { dismissed: resolved.length };
  });
}
