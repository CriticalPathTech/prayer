import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import { UnauthorizedError, ValidationError } from '../middleware/error.js';
import { dismissFlags } from '../services/flags.js';
import { hideTarget, listModQueue, unhideTarget } from '../services/moderation.js';

const zQueueQuery = z.object({
  status: z.enum(['pending', 'auto_hidden', 'manually_hidden']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function moderationRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.post('/mod/posts/:id/hide', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const out = await hideTarget(deps.db, {
        callerId: req.user.id,
        callerRole: req.user.role,
        targetType: 'post',
        targetId: req.params.id!,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  router.post('/mod/posts/:id/unhide', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const out = await unhideTarget(deps.db, {
        callerId: req.user.id,
        callerRole: req.user.role,
        targetType: 'post',
        targetId: req.params.id!,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  router.post('/mod/posts/:id/dismiss-flags', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const out = await dismissFlags(deps.db, {
        callerId: req.user.id,
        callerRole: req.user.role,
        targetType: 'post',
        postId: req.params.id!,
        targetId: req.params.id!,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  router.post('/mod/comments/:id/hide', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const out = await hideTarget(deps.db, {
        callerId: req.user.id,
        callerRole: req.user.role,
        targetType: 'comment',
        targetId: req.params.id!,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  router.post('/mod/comments/:id/unhide', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const out = await unhideTarget(deps.db, {
        callerId: req.user.id,
        callerRole: req.user.role,
        targetType: 'comment',
        targetId: req.params.id!,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  router.post('/mod/comments/:id/dismiss-flags', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const comment = await deps.db
        .selectFrom('comments')
        .select('post_id')
        .where('id', '=', req.params.id!)
        .executeTakeFirst();
      const out = await dismissFlags(deps.db, {
        callerId: req.user.id,
        callerRole: req.user.role,
        targetType: 'comment',
        postId: comment?.post_id ?? req.params.id!,
        targetId: req.params.id!,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  router.get('/mod/queue', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zQueueQuery.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const out = await listModQueue(deps.db, {
        callerRole: req.user.role,
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
        limit: parsed.data.limit,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
