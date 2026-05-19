import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import { NotFoundError, UnauthorizedError, ValidationError } from '../middleware/error.js';
import { writePostEvent } from '../services/events.js';
import { fetchPostRow, toPostDto } from '../services/posts.js';

const zPin = z.object({
  duration_days: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(14), z.literal(30)]),
});

export function modPostsPinRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();

  router.post('/mod/posts/:id/pin', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zPin.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);

      const postId = req.params['id']!;
      const result = await deps.db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom('posts')
          .select(['id', 'status', 'pinned_at'])
          .where('id', '=', postId)
          .where('org_id', '=', req.user!.orgId)
          .executeTakeFirst();
        if (!existing) throw new NotFoundError('Post not found');
        if (existing.status !== 'published') {
          return { kind: 'not_published' as const };
        }
        if (existing.pinned_at !== null) {
          return { kind: 'already_pinned' as const };
        }
        const now = new Date();
        const pinUntil = new Date(now.getTime() + parsed.data.duration_days * 86_400_000);
        await trx
          .updateTable('posts')
          .set({ pinned_at: now, pin_until: pinUntil, pinned_by: req.user!.id })
          .where('id', '=', postId)
          .where('org_id', '=', req.user!.orgId)
          .execute();
        await writePostEvent(trx, {
          kind: 'post.pinned',
          orgId: req.user!.orgId,
          postId,
          actorId: req.user!.id,
          payload: { pin_until: pinUntil.toISOString(), pinned_by: req.user!.id },
        });
        const row = await fetchPostRow(trx, { postId, orgId: req.user!.orgId });
        return { kind: 'ok' as const, dto: toPostDto(row, { role: req.user!.role }, req.user!.id) };
      });

      if (result.kind === 'not_published') {
        res.status(409).json({ error: 'not_published' });
        return;
      }
      if (result.kind === 'already_pinned') {
        res.status(409).json({ error: 'already_pinned' });
        return;
      }
      res.status(200).json({ post: result.dto });
    } catch (err) {
      next(err);
    }
  });

  router.post('/mod/posts/:id/unpin', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const postId = req.params['id']!;
      const dto = await deps.db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom('posts')
          .select(['id', 'pinned_at'])
          .where('id', '=', postId)
          .where('org_id', '=', req.user!.orgId)
          .executeTakeFirst();
        if (!existing) throw new NotFoundError('Post not found');
        if (existing.pinned_at !== null) {
          await trx
            .updateTable('posts')
            .set({ pinned_at: null, pin_until: null, pinned_by: null })
            .where('id', '=', postId)
            .where('org_id', '=', req.user!.orgId)
            .execute();
          await writePostEvent(trx, {
            kind: 'post.unpinned',
            orgId: req.user!.orgId,
            postId,
            actorId: req.user!.id,
            payload: {},
          });
        }
        const row = await fetchPostRow(trx, { postId, orgId: req.user!.orgId });
        return toPostDto(row, { role: req.user!.role }, req.user!.id);
      });
      res.status(200).json({ post: dto });
    } catch (err) {
      // NotFoundError from missing post falls through to errorHandler → 404.
      next(err);
    }
  });

  return router;
}
