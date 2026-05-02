import type { Database, UserRole } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';

import { UnauthorizedError, ValidationError } from '../middleware/error.js';
import {
  changeMemberRole,
  countSuperUsers,
  getChurchSettings,
  listMembers,
  removeMember,
  updateChurchSettings,
} from '../services/church-admin.js';

const VALID_ROLES: readonly UserRole[] = ['member', 'moderator', 'super_user'];

export function adminChurchRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.get('/admin/church/members', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const [members, settings, superUserCount] = await Promise.all([
        listMembers(deps.db, req.user.orgId),
        getChurchSettings(deps.db, req.user.orgId),
        countSuperUsers(deps.db, req.user.orgId),
      ]);
      res.json({ members, org: settings, superUserCount });
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

  router.patch('/admin/church/members/:userId', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const body = (req.body ?? {}) as { role?: unknown };
      const { role } = body;
      if (typeof role !== 'string' || !(VALID_ROLES as readonly string[]).includes(role)) {
        throw new ValidationError('role must be one of: member, moderator, super_user');
      }
      await changeMemberRole(deps.db, {
        actorId: req.user.id,
        targetUserId: req.params.userId!,
        orgId: req.user.orgId,
        newRole: role as UserRole,
      });
      // Re-read the row so the response reflects the post-update state.
      const members = await listMembers(deps.db, req.user.orgId);
      // Service confirmed the row exists; non-null assertion is safe.
      const updated = members.find((m) => m.id === req.params.userId)!;
      res.json({ member: updated });
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
