import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import { UnauthorizedError, ValidationError } from '../middleware/error.js';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notifications.js';

const zListQuery = z.object({
  unread: z.enum(['true', 'false']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function notificationsRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.get('/notifications', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zListQuery.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const out = await listNotifications(deps.db, {
        orgId: req.user.orgId,
        callerId: req.user.id,
        ...(parsed.data.unread === 'true' ? { unread: true } : {}),
        ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
        limit: parsed.data.limit,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  // IMPORTANT: mount read-all BEFORE :id/read so Express doesn't interpret "read-all" as a UUID.
  router.post('/notifications/read-all', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const out = await markAllNotificationsRead(deps.db, {
        orgId: req.user.orgId,
        callerId: req.user.id,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications/:id/read', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const out = await markNotificationRead(deps.db, {
        orgId: req.user.orgId,
        callerId: req.user.id,
        id: req.params.id!,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
