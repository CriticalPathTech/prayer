import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';

import { UnauthorizedError, ValidationError } from '../middleware/error.js';
import { getSnapshotId } from '../services/feed-snapshot.js';
import { fetchFeed, zFeedQuery } from '../services/feed.js';

export function feedRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.get('/feed', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zFeedQuery.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const out = await fetchFeed(deps.db, {
        ...parsed.data,
        callerRole: req.user.role,
        callerId: req.user.id,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  router.get('/feed/snapshot', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      res.json({ snapshotId: await getSnapshotId(deps.db) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
