import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import type { StorageClient } from '../lib/storage.js';
import { UnauthorizedError, ValidationError } from '../middleware/error.js';
import { listFollowupPosts } from '../services/mod-followup.js';

const zQuery = z.object({
  no_prayers: z.coerce.boolean().default(false),
  no_reactions: z.coerce.boolean().default(false),
  no_comments: z.coerce.boolean().default(false),
  no_updates: z.coerce.boolean().default(false),
  no_mod_response: z.coerce.boolean().default(false),
  min_age_value: z.coerce.number().int().min(0).max(8760).default(0),
  min_age_unit: z.enum(['hours', 'days']).default('days'),
  sort: z.enum(['oldest', 'newest']).default('oldest'),
  cursor: z.string().optional(),
});

export function modFollowupRouter(deps: { db: Kysely<Database>; storage: StorageClient }): Router {
  const router = Router();

  router.get('/mod/follow-up', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zQuery.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const out = await listFollowupPosts(deps.db, deps.storage, {
        callerRole: req.user.role,
        callerId: req.user.id,
        orgId: req.user.orgId,
        filters: {
          noPrayers: parsed.data.no_prayers,
          noReactions: parsed.data.no_reactions,
          noComments: parsed.data.no_comments,
          noUpdates: parsed.data.no_updates,
          noModResponse: parsed.data.no_mod_response,
        },
        minAge: { value: parsed.data.min_age_value, unit: parsed.data.min_age_unit },
        sort: parsed.data.sort,
        ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
        limit: 25,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
