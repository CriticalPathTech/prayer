import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';

import { UnauthorizedError } from '../middleware/error.js';

/** GET /me/orgs — list every org the authenticated user belongs to.
 *
 * Mounted with `requireSession` only (no orgContext) — the caller is by
 * definition asking "which org should I send X-Org-Slug for?" so we can't
 * require it on the way in. Returns `[]` if the supabase identity has no
 * matching `users` row yet (pre-onboarding) or no memberships.
 */
export function meOrgsRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      if (!req.supabase) throw new UnauthorizedError();
      const rows = await deps.db
        .selectFrom('users as u')
        .innerJoin('user_orgs as uo', 'uo.user_id', 'u.id')
        .innerJoin('orgs as o', 'o.id', 'uo.org_id')
        .where('u.supabase_auth_id', '=', req.supabase.auth_id)
        .select(['o.id as org_id', 'o.slug', 'o.display_name', 'uo.role'])
        .orderBy('o.slug', 'asc')
        .execute();
      res.json({
        orgs: rows.map((r) => ({
          org_id: r.org_id,
          slug: r.slug,
          display_name: r.display_name,
          role: r.role,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
