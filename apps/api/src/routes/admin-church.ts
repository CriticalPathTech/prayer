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
import type { OrgResolver } from '../services/orgs.js';

const VALID_ROLES: readonly UserRole[] = ['member', 'moderator', 'super_user'];

export function adminChurchRouter(deps: {
  db: Kysely<Database>;
  orgResolver: OrgResolver;
}): Router {
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
      const body = (req.body ?? {}) as {
        displayName?: unknown;
        requiresPostApproval?: unknown;
      };
      if (typeof body.displayName !== 'string') {
        res.status(400).json({ error: 'displayName must be a string' });
        return;
      }
      if (
        body.requiresPostApproval !== undefined &&
        typeof body.requiresPostApproval !== 'boolean'
      ) {
        res.status(400).json({ error: 'requiresPostApproval must be a boolean' });
        return;
      }
      const result = await updateChurchSettings(deps.db, {
        orgId: req.user.orgId,
        actorId: req.user.id,
        displayName: body.displayName,
        ...(body.requiresPostApproval !== undefined
          ? { requiresPostApproval: body.requiresPostApproval }
          : {}),
      });
      // Drop any cached org rows pointing at this orgId so subsequent requests
      // re-read the new display_name instead of serving the previous value for
      // up to HOST_TO_ORG_TTL_MS (5 min).
      deps.orgResolver.invalidateByOrgId(req.user.orgId);
      res.json({
        org: {
          id: result.id,
          slug: req.org!.slug,
          displayName: result.displayName,
          requiresPostApproval: result.requiresPostApproval,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
