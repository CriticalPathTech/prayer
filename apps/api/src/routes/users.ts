import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import { NotFoundError, UnauthorizedError, ValidationError } from '../middleware/error.js';
import { fetchUserById, fetchUserPosts } from '../services/users.js';

const zPostsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function usersRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.get('/users/:userId', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const userId = req.params.userId;
      if (!userId) throw new ValidationError('Missing userId');
      const dto = await fetchUserById(deps.db, {
        userId,
        orgId: req.user.orgId,
      });
      if (!dto) throw new NotFoundError('User not found');
      res.json(dto);
    } catch (err) {
      next(err);
    }
  });

  router.get('/users/:userId/posts', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const userId = req.params.userId;
      if (!userId) throw new ValidationError('Missing userId');
      const parsed = zPostsQuery.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      // Resolve target via fetchUserById first for consistent 404 + cross-org
      // semantics. Without this gate, a cross-org caller would get a 200 with
      // an empty `posts` array — surface a 404 instead so the client can
      // distinguish "user doesn't exist / not in your church" from "user has no
      // visible posts".
      const target = await fetchUserById(deps.db, {
        userId,
        orgId: req.user.orgId,
      });
      if (!target) throw new NotFoundError('User not found');
      const out = await fetchUserPosts(deps.db, {
        userId,
        callerRole: req.user.role,
        callerId: req.user.id,
        orgId: req.user.orgId,
        cursor: parsed.data.cursor ?? null,
        limit: parsed.data.limit,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
