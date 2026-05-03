import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import { ValidationError } from '../middleware/error.js';
import {
  listInviteCodesForOwner,
  mintInviteCode,
  retireInviteCode,
} from '../services/invite-codes.js';

const zGrant = z.object({
  owner_id: z.string().uuid(),
  seat_cap: z.number().int().min(1).max(10),
});
const zSearch = z.object({ q: z.string().min(1).max(60) });
const zList = z.object({ owner_id: z.string().uuid() });

export function modInviteCodesRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.post('/mod/invite-codes', async (req, res, next) => {
    try {
      const parsed = zGrant.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const out = await mintInviteCode(deps.db, {
        ownerId: parsed.data.owner_id,
        seatCap: parsed.data.seat_cap,
      });
      res.json({ ...out, is_active: true, created_at: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/mod/invite-codes/:id/retire', async (req, res, next) => {
    try {
      await retireInviteCode(deps.db, { codeId: req.params.id! });
      res.json({ is_active: false });
    } catch (err) {
      next(err);
    }
  });

  router.get('/mod/invite-codes', async (req, res, next) => {
    try {
      const parsed = zList.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const out = await listInviteCodesForOwner(deps.db, { ownerId: parsed.data.owner_id });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  router.get('/mod/users/search', async (req, res, next) => {
    try {
      const parsed = zSearch.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const q = parsed.data.q.toLowerCase();
      const rows = await deps.db
        .selectFrom('users')
        .select(['id', 'display_name', 'email'])
        .where((eb) => eb.or([eb('display_name', 'ilike', `${q}%`), eb('email', 'ilike', `${q}%`)]))
        .orderBy('display_name')
        .limit(10)
        .execute();
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
