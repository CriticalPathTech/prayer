import type { Database } from '@prayer/db';
import { raw, Router } from 'express';
import type { Kysely } from 'kysely';

import type { StorageClient } from '../lib/storage.js';
import { PayloadTooLargeError, UnauthorizedError } from '../middleware/error.js';
import { deleteOwnPostImage, uploadPostImage } from '../services/post-images.js';

// Raw binary rather than the base64 data-URL shape used by /me/avatar.
// Avatars are ~100KB after the client crops them; a phone photo is 4-12MB and
// base64 inflates that by a third. Raw bytes are also markedly simpler to send
// from the Swift and Kotlin clients.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export function meImagesRouter(deps: { db: Kysely<Database>; storage: StorageClient }): Router {
  const router = Router();

  const imageBody = raw({ type: '*/*', limit: MAX_UPLOAD_BYTES });

  router.post(
    '/me/images',
    (req, res, next) => {
      imageBody(req, res, (err?: unknown) => {
        if (
          err &&
          typeof err === 'object' &&
          (err as { type?: string }).type === 'entity.too.large'
        ) {
          return next(new PayloadTooLargeError());
        }
        next(err);
      });
    },
    async (req, res, next) => {
      try {
        if (!req.user) throw new UnauthorizedError();
        const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        const image = await uploadPostImage(deps.db, deps.storage, {
          ownerId: req.user.id,
          orgId: req.user.orgId,
          bytes,
        });
        res.json({ image });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete('/me/images/:id', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      await deleteOwnPostImage(deps.db, deps.storage, {
        imageId: req.params.id!,
        ownerId: req.user.id,
        orgId: req.user.orgId,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
