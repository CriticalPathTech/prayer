import type { Database, UserRole, ReactionTargetType } from '@prayer/db';
import { newId } from '@prayer/db';
import { emojiSchema, type Emoji } from '@prayer/shared';
import type { Kysely } from 'kysely';

import { isPrivilegedRole } from '../lib/roles.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../middleware/error.js';

import { writeReactionEvent } from './events.js';

export interface ToggleReactionInput {
  callerId: string;
  callerRole: UserRole;
  orgId: string;
  targetType: ReactionTargetType;
  postId: string; // parent post id (always, even for comment target)
  targetId: string;
  emoji: Emoji;
}

export interface ToggleReactionResult {
  reacted: boolean;
  reaction_count: number;
}

export async function toggleReaction(
  db: Kysely<Database>,
  input: ToggleReactionInput,
): Promise<ToggleReactionResult> {
  const parsed = emojiSchema.safeParse(input.emoji);
  if (!parsed.success) throw new ValidationError('invalid emoji');

  return db.transaction().execute(async (trx) => {
    const post = await trx
      .selectFrom('posts')
      .select(['id', 'author_id', 'status'])
      .where('id', '=', input.postId)
      .where('org_id', '=', input.orgId)
      .executeTakeFirst();
    if (!post || post.status !== 'published') throw new NotFoundError('Post not found');

    if (input.targetType === 'comment') {
      const comment = await trx
        .selectFrom('comments')
        .select(['id', 'author_id', 'participant_id', 'post_id'])
        .where('id', '=', input.targetId)
        .where('org_id', '=', input.orgId)
        .executeTakeFirst();
      if (!comment || comment.post_id !== input.postId) {
        throw new NotFoundError('Comment not found');
      }
      const isPrivileged = isPrivilegedRole(input.callerRole);
      const isPostAuthor = post.author_id === input.callerId;
      const isCommentAuthor = comment.author_id === input.callerId;
      const isParticipant = comment.participant_id === input.callerId;
      if (!isPrivileged && !isPostAuthor && !isCommentAuthor && !isParticipant) {
        throw new ForbiddenError();
      }
    }

    const existing = await trx
      .selectFrom('reactions')
      .select('id')
      .where('target_type', '=', input.targetType)
      .where('target_id', '=', input.targetId)
      .where('author_id', '=', input.callerId)
      .where('emoji', '=', input.emoji)
      .forUpdate()
      .executeTakeFirst();

    if (existing) {
      await trx.deleteFrom('reactions').where('id', '=', existing.id).execute();
      await writeReactionEvent(trx, {
        kind: 'reaction.removed',
        orgId: input.orgId,
        postId: input.postId,
        actorId: input.callerId,
        targetType: input.targetType,
        targetId: input.targetId,
        emoji: input.emoji,
      });
    } else {
      await trx
        .insertInto('reactions')
        .values({
          id: newId(),
          org_id: input.orgId,
          target_type: input.targetType,
          target_id: input.targetId,
          author_id: input.callerId,
          emoji: input.emoji,
        })
        .execute();
      await writeReactionEvent(trx, {
        kind: 'reaction.added',
        orgId: input.orgId,
        postId: input.postId,
        actorId: input.callerId,
        targetType: input.targetType,
        targetId: input.targetId,
        emoji: input.emoji,
      });
    }

    // Count read is post-toggle; counter column reflects consumer state (may lag by 1
    // until the event-worker processes the event).
    let reactionCount = 0;
    if (input.targetType === 'post') {
      const row = await trx
        .selectFrom('posts')
        .select('reaction_count')
        .where('id', '=', input.targetId)
        .where('org_id', '=', input.orgId)
        .executeTakeFirstOrThrow();
      reactionCount = row.reaction_count;
    } else {
      const row = await trx
        .selectFrom('comments')
        .select('reaction_count')
        .where('id', '=', input.targetId)
        .where('org_id', '=', input.orgId)
        .executeTakeFirstOrThrow();
      reactionCount = row.reaction_count;
    }
    return { reacted: !existing, reaction_count: reactionCount };
  });
}
