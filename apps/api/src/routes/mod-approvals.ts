import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import type { StorageClient } from '../lib/storage.js';
import { UnauthorizedError, ValidationError } from '../middleware/error.js';
import {
  approvePost,
  listApprovals,
  rejectPost,
  skipPostReview,
  unskipPostReview,
} from '../services/post-approvals.js';

const zRejectBody = z.object({ note: z.string().max(500).optional() });
const zListQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

export function modApprovalsRouter(deps: { db: Kysely<Database>; storage: StorageClient }): Router {
  const router = Router();

  router.get('/mod/approvals', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zListQuery.safeParse(req.query);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const out = await listApprovals(deps.db, deps.storage, {
        orgId: req.user.orgId,
        callerId: req.user.id,
        callerRole: req.user.role,
        limit: parsed.data.limit,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  router.post('/mod/posts/:id/approve', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const post = await approvePost(deps.db, {
        postId: req.params.id!,
        orgId: req.user.orgId,
        callerId: req.user.id,
        callerRole: req.user.role,
      });
      res.json({ post });
    } catch (err) {
      next(err);
    }
  });

  router.post('/mod/posts/:id/reject', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zRejectBody.safeParse(req.body ?? {});
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const post = await rejectPost(deps.db, {
        postId: req.params.id!,
        orgId: req.user.orgId,
        callerId: req.user.id,
        callerRole: req.user.role,
        ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
      });
      res.json({ post });
    } catch (err) {
      next(err);
    }
  });

  router.post('/mod/posts/:id/skip', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      await skipPostReview(deps.db, {
        postId: req.params.id!,
        orgId: req.user.orgId,
        callerId: req.user.id,
        callerRole: req.user.role,
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.delete('/mod/posts/:id/skip', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      await unskipPostReview(deps.db, {
        postId: req.params.id!,
        orgId: req.user.orgId,
        callerId: req.user.id,
        callerRole: req.user.role,
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
