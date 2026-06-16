import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';

import { NotFoundError } from '../middleware/error.js';
import { getOrgLogo } from '../services/logo.js';

/** Public, unauthenticated endpoint that exposes the resolved org's
 * branding (display name + optional custom logo) so pre-auth pages can show
 * the church's customised identity. orgContext has already mapped Host → org.
 */
export function orgRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.get('/org', async (req, res, next) => {
    try {
      const org = req.org;
      if (!org) throw new NotFoundError('Unknown host');
      const logo = await getOrgLogo(deps.db, org.id);
      res.json({ slug: org.slug, displayName: org.displayName, logo });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
