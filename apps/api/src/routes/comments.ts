import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import { zCreateFlag, zToggleReaction } from '../lib/schemas.js';
import { UnauthorizedError, ValidationError } from '../middleware/error.js';
import {
  createComment,
  editComment,
  hideComment,
  listCommentsForPost,
} from '../services/comments.js';
import { createFlag } from '../services/flags.js';
import { toggleReaction } from '../services/reactions.js';

const zCreateComment = z.object({
  body: z.string().min(1).max(2_000),
  participant_id: z.string().uuid().optional(),
});

const zEditComment = z.object({
  body: z.string().min(1).max(2_000),
});

export function commentsRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.post('/posts/:postId/comments', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zCreateComment.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const comment = await createComment(deps.db, {
        postId: req.params.postId!,
        orgId: req.user.orgId,
        callerId: req.user.id,
        callerRole: req.user.role,
        body: parsed.data.body,
        ...(parsed.data.participant_id !== undefined
          ? { participantId: parsed.data.participant_id }
          : {}),
      });
      res.status(201).json({ comment });
    } catch (err) {
      next(err);
    }
  });

  router.get('/posts/:postId/comments', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const out = await listCommentsForPost(deps.db, {
        postId: req.params.postId!,
        orgId: req.user.orgId,
        callerId: req.user.id,
        callerRole: req.user.role,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/posts/:postId/comments/:id', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zEditComment.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const comment = await editComment(deps.db, {
        commentId: req.params.id!,
        orgId: req.user.orgId,
        callerId: req.user.id,
        callerRole: req.user.role,
        body: parsed.data.body,
      });
      res.json({ comment });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/posts/:postId/comments/:id', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      await hideComment(deps.db, {
        commentId: req.params.id!,
        orgId: req.user.orgId,
        callerId: req.user.id,
        callerRole: req.user.role,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/posts/:postId/comments/:commentId/reactions', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zToggleReaction.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const out = await toggleReaction(deps.db, {
        callerId: req.user.id,
        callerRole: req.user.role,
        orgId: req.user.orgId,
        targetType: 'comment',
        postId: req.params.postId!,
        targetId: req.params.commentId!,
        emoji: parsed.data.emoji,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  router.post('/posts/:postId/comments/:commentId/flags', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zCreateFlag.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const out = await createFlag(deps.db, {
        callerId: req.user.id,
        orgId: req.user.orgId,
        targetType: 'comment',
        postId: req.params.postId!,
        targetId: req.params.commentId!,
        reason: parsed.data.reason,
        ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
