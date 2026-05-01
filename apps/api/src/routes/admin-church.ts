import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';

import { UnauthorizedError } from '../middleware/error.js';
import {
  getChurchSettings,
  listMembers,
  removeMember,
  updateChurchSettings,
} from '../services/church-admin.js';

export function adminChurchRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.get('/admin/church/members', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const [members, settings] = await Promise.all([
        listMembers(deps.db, req.user.orgId),
        getChurchSettings(deps.db, req.user.orgId),
      ]);
      res.json({ members, org: settings });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/admin/church/members/:userId', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      await removeMember(deps.db, {
        actorId: req.user.id,
        targetUserId: req.params.userId!,
        orgId: req.user.orgId,
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.patch('/admin/church/settings', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { displayName } = req.body ?? {};
      if (typeof displayName !== 'string') {
        res.status(400).json({ error: 'displayName must be a string' });
        return;
      }
      const result = await updateChurchSettings(deps.db, {
        orgId: req.user.orgId,
        actorId: req.user.id,
        displayName,
      });
      res.json({
        org: {
          id: result.id,
          slug: req.org!.slug,
          displayName: result.displayName,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
