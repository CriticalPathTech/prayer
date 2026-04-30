import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import { UnauthorizedError, ValidationError } from '../middleware/error.js';
import { getOwnDraft, publishOwnDraft, upsertOwnDraft } from '../services/posts.js';

const zPutDraft = z.object({
  body: z.string().max(10_000),
  expires_at: z.string().datetime().optional(),
  is_anonymous: z.boolean().optional(),
});

export function meDraftRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.get('/me/draft', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const draft = await getOwnDraft(deps.db, {
        userId: req.user.id,
        orgId: req.user.orgId,
        callerRole: req.user.role,
      });
      res.json({ draft });
    } catch (err) {
      next(err);
    }
  });

  router.put('/me/draft', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zPutDraft.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const draft = await upsertOwnDraft(deps.db, {
        userId: req.user.id,
        orgId: req.user.orgId,
        callerRole: req.user.role,
        input: {
          body: parsed.data.body,
          ...(parsed.data.expires_at !== undefined && { expires_at: parsed.data.expires_at }),
          ...(parsed.data.is_anonymous !== undefined && { is_anonymous: parsed.data.is_anonymous }),
        },
      });
      res.json({ draft });
    } catch (err) {
      next(err);
    }
  });

  router.post('/me/draft/publish', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const post = await publishOwnDraft(deps.db, {
        userId: req.user.id,
        orgId: req.user.orgId,
        callerRole: req.user.role,
      });
      res.status(200).json({ post });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
