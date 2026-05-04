import { Router } from 'express';

import { NotFoundError } from '../middleware/error.js';

/** Public, unauthenticated endpoint that exposes the resolved org's
 * branding so pre-auth pages (login, signup, etc.) can show the church's
 * customised display name. orgContext has already mapped Host → org;
 * this route just hands it back to the caller.
 */
export function orgRouter(): Router {
  const router = Router();

  router.get('/org', (req, res, next) => {
    try {
      const org = req.org;
      if (!org) throw new NotFoundError('Unknown host');
      res.json({ slug: org.slug, displayName: org.displayName });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
