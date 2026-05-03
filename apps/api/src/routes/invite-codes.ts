import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import { ValidationError } from '../middleware/error.js';
import { previewInviteCode } from '../services/invite-codes.js';

const zParams = z.object({ code: z.string().min(1).max(5) });

export function publicInviteCodesRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.get('/invite-codes/:code', async (req, res, next) => {
    try {
      const parsed = zParams.safeParse(req.params);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const out = await previewInviteCode(deps.db, { code: parsed.data.code });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
