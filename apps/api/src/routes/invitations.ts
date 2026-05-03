import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import { UnauthorizedError, ValidationError } from '../middleware/error.js';
import { redeemInvitation } from '../services/invitations.js';

const zRedeem = z.object({
  code: z.string().regex(/^[a-z0-9]{5}$/i, 'invalid code'),
});

export function invitationsRedeemRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.post('/invitations/redeem', async (req, res, next) => {
    try {
      if (!req.supabase) throw new UnauthorizedError();
      const parsed = zRedeem.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);

      const out = await redeemInvitation(deps.db, {
        supabaseAuthId: req.supabase.auth_id,
        email: req.supabase.email,
        code: parsed.data.code,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
