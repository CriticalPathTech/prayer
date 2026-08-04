import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import type { StorageClient } from '../lib/storage.js';
import { UnauthorizedError, ValidationError } from '../middleware/error.js';
import { hydratePostImages } from '../services/post-images.js';
import { getOwnDraft, publishOwnDraft, upsertOwnDraft } from '../services/posts.js';

const zPutDraft = z.object({
  body: z.string().max(10_000),
  expires_at: z.string().datetime().optional(),
  is_anonymous: z.boolean().optional(),
  image_ids: z.array(z.string().uuid()).max(3).optional(),
});

const zPublishDraft = z.object({
  pin_duration_days: z
    .union([z.literal(1), z.literal(3), z.literal(7), z.literal(14), z.literal(30)])
    .optional(),
});

export function meDraftRouter(deps: { db: Kysely<Database>; storage: StorageClient }): Router {
  const router = Router();

  router.get('/me/draft', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const draft = await getOwnDraft(deps.db, {
        userId: req.user.id,
        orgId: req.user.orgId,
        callerRole: req.user.role,
      });
      if (!draft) {
        res.json({ draft: null });
        return;
      }
      const images = await hydratePostImages(deps.db, deps.storage, {
        postIds: [draft.id],
        orgId: req.user.orgId,
      });
      res.json({ draft: { ...draft, images: images.get(draft.id) ?? [] } });
    } catch (err) {
      next(err);
    }
  });

  router.put('/me/draft', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zPutDraft.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const draft = await upsertOwnDraft(deps.db, {
        userId: req.user.id,
        orgId: req.user.orgId,
        callerRole: req.user.role,
        input: {
          body: parsed.data.body,
          ...(parsed.data.expires_at !== undefined && { expires_at: parsed.data.expires_at }),
          ...(parsed.data.is_anonymous !== undefined && { is_anonymous: parsed.data.is_anonymous }),
          ...(parsed.data.image_ids !== undefined && { imageIds: parsed.data.image_ids }),
        },
      });
      res.json({ draft });
    } catch (err) {
      next(err);
    }
  });

  router.post('/me/draft/publish', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zPublishDraft.safeParse(req.body ?? {});
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const post = await publishOwnDraft(deps.db, {
        userId: req.user.id,
        orgId: req.user.orgId,
        callerRole: req.user.role,
        requiresPostApproval: req.org!.requiresPostApproval,
        ...(parsed.data.pin_duration_days !== undefined
          ? { pinDurationDays: parsed.data.pin_duration_days }
          : {}),
      });
      res.status(200).json({ post });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
