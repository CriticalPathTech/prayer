import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import { UnauthorizedError, ValidationError } from '../middleware/error.js';
import { extendPost, toPostDto } from '../services/posts.js';

const zExtend = z.object({
  duration_days: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(14), z.literal(30)]),
});

export function modPostsExtendRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.post('/mod/posts/:id/extend', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zExtend.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);

      const result = await extendPost(deps.db, {
        postId: req.params['id']!,
        orgId: req.user.orgId,
        moderatorId: req.user.id,
        durationDays: parsed.data.duration_days,
      });

      if (result.kind === 'not_extendable') {
        res.status(409).json({ error: 'not_extendable' });
        return;
      }
      res.status(200).json({ post: toPostDto(result.row, { role: req.user.role }, req.user.id) });
    } catch (err) {
      // NotFoundError (missing / cross-org post) falls through to errorHandler → 404.
      next(err);
    }
  });

  return router;
}
