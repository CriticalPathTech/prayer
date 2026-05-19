import type { Database } from '@prayer/db';
import { Router, json } from 'express';
import type { Kysely } from 'kysely';
import { z } from 'zod';

import type { StorageClient } from '../lib/storage.js';
import { PayloadTooLargeError, UnauthorizedError, ValidationError } from '../middleware/error.js';
import { deleteOwnAvatar, uploadOwnAvatar } from '../services/avatars.js';
import { listInviteCodesForOwner } from '../services/invite-codes.js';
import { updateDisplayName } from '../services/users.js';

const zPatchMe = z.object({
  display_name: z.string().min(1).max(120),
});

const zPostAvatar = z.object({
  image_data: z.string().min(1).max(3_500_000),
});

const MAX_DECODED_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DATA_URL_RE = /^data:(image\/[a-z+.-]+);base64,(.+)$/i;

/** Verify the decoded image bytes match the declared content-type via magic
 * bytes. The data-URL header is client-controlled, so a hostile client could
 * declare `image/jpeg` and embed an SVG/HTML/EXE payload. Each allowed MIME
 * has a stable magic-byte signature in the first 12 bytes. */
function detectMime(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: "RIFF" + size + "WEBP"
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function meRouter(deps: {
  db: Kysely<Database>;
  storage: StorageClient;
  publicUrlBase: string;
}): Router {
  const router = Router();

  router.get('/me', (req, res) => {
    res.json({
      ...req.user,
      org: req.org
        ? {
            displayName: req.org.displayName,
            requiresPostApproval: req.org.requiresPostApproval,
          }
        : null,
    });
  });

  router.patch('/me', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zPatchMe.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const out = await updateDisplayName(deps.db, {
        userId: req.user.id,
        orgId: req.user.orgId,
        input: parsed.data.display_name,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  const avatarBody = json({ limit: '3mb' });
  router.post(
    '/me/avatar',
    (req, res, next) => {
      avatarBody(req, res, (err?: unknown) => {
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
        const parsed = zPostAvatar.safeParse(req.body);
        if (!parsed.success) throw new ValidationError(parsed.error.message);

        const match = DATA_URL_RE.exec(parsed.data.image_data);
        if (!match) throw new ValidationError('Unsupported image format.');
        const contentType = match[1]!.toLowerCase();
        const base64 = match[2]!;
        if (!ALLOWED_MIME.has(contentType)) throw new ValidationError('Unsupported image format.');

        const buffer = Buffer.from(base64, 'base64');
        if (buffer.byteLength > MAX_DECODED_BYTES) throw new PayloadTooLargeError();

        // Defense against content-type spoofing in the data-URL header.
        const detected = detectMime(buffer);
        if (!detected || detected !== contentType) {
          throw new ValidationError('Image content does not match declared type.');
        }

        const { avatar_url } = await uploadOwnAvatar(deps.db, deps.storage, {
          userId: req.user.id,
          supabaseAuthId: req.user.supabaseAuthId,
          imageBuffer: buffer,
          contentType,
          publicUrlBase: deps.publicUrlBase,
        });

        res.json({
          id: req.user.id,
          email: req.user.email,
          display_name: req.user.displayName,
          avatar_url,
          role: req.user.role,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete('/me/avatar', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      await deleteOwnAvatar(deps.db, deps.storage, {
        userId: req.user.id,
        supabaseAuthId: req.user.supabaseAuthId,
      });
      res.json({
        id: req.user.id,
        email: req.user.email,
        display_name: req.user.displayName,
        avatar_url: null,
        role: req.user.role,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me/invites', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const codes = await listInviteCodesForOwner(deps.db, {
        ownerId: req.user.id,
        orgId: req.user.orgId,
      });
      res.json({
        active: codes.filter((c) => c.is_active),
        retired: codes.filter((c) => !c.is_active),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
