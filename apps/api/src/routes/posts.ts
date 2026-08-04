import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';

import { zCreateFlag, zToggleReaction } from '../lib/schemas.js';
import type { StorageClient } from '../lib/storage.js';
import { UnauthorizedError, ValidationError } from '../middleware/error.js';
import { createFlag } from '../services/flags.js';
import {
  archivePost,
  createPost,
  createUpdate,
  editPost,
  editUpdate,
  getPostWithUpdates,
  listArchive,
  publishPost,
  zCreatePost,
  zCreateUpdate,
  zEditPost,
  zEditUpdate,
} from '../services/posts.js';
import { togglePrayer } from '../services/prayers.js';
import { toggleReaction } from '../services/reactions.js';

export function postsRouter(deps: { db: Kysely<Database>; storage: StorageClient }): Router {
  const router = Router();

  router.post('/posts', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zCreatePost.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const post = await createPost(deps.db, {
        authorId: req.user.id,
        orgId: req.user.orgId,
        callerRole: req.user.role,
        body: parsed.data.body,
        ...(parsed.data.expires_at !== undefined && { expiresAt: parsed.data.expires_at }),
        ...(parsed.data.is_anonymous !== undefined && { isAnonymous: parsed.data.is_anonymous }),
        ...(parsed.data.pin_duration_days !== undefined && {
          pinDurationDays: parsed.data.pin_duration_days,
        }),
      });
      res.status(201).json({ post });
    } catch (err) {
      next(err);
    }
  });

  router.get('/posts/me/archive', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const posts = await listArchive(deps.db, {
        authorId: req.user.id,
        orgId: req.user.orgId,
        callerRole: req.user.role,
      });
      res.json({ posts });
    } catch (err) {
      next(err);
    }
  });

  router.post('/posts/:id/publish', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const post = await publishPost(deps.db, {
        postId: req.params.id!,
        orgId: req.user.orgId,
        callerId: req.user.id,
        callerRole: req.user.role,
      });
      res.status(200).json({ post });
    } catch (err) {
      next(err);
    }
  });

  router.get('/posts/:id', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const data = await getPostWithUpdates(deps.db, deps.storage, {
        postId: req.params.id!,
        orgId: req.user.orgId,
        callerId: req.user.id,
        callerRole: req.user.role,
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/posts/:id', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zEditPost.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const post = await editPost(deps.db, {
        postId: req.params.id!,
        orgId: req.user.orgId,
        callerId: req.user.id,
        callerRole: req.user.role,
        ...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}),
        ...(parsed.data.expires_at !== undefined ? { expiresAt: parsed.data.expires_at } : {}),
      });
      res.json({ post });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/posts/:id', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      await archivePost(deps.db, {
        postId: req.params.id!,
        orgId: req.user.orgId,
        callerId: req.user.id,
        reason: 'author',
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/posts/:id/updates', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zCreateUpdate.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const update = await createUpdate(deps.db, {
        parentId: req.params.id!,
        orgId: req.user.orgId,
        callerId: req.user.id,
        callerRole: req.user.role,
        body: parsed.data.body,
        ...(parsed.data.is_answered_prayer !== undefined
          ? { isAnsweredPrayer: parsed.data.is_answered_prayer }
          : {}),
      });
      res.status(201).json({ update });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/posts/:id/updates/:uid', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zEditUpdate.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const update = await editUpdate(deps.db, {
        parentId: req.params.id!,
        updateId: req.params.uid!,
        orgId: req.user.orgId,
        callerId: req.user.id,
        callerRole: req.user.role,
        ...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}),
        ...(parsed.data.is_answered_prayer !== undefined
          ? { isAnsweredPrayer: parsed.data.is_answered_prayer }
          : {}),
      });
      res.json({ update });
    } catch (err) {
      next(err);
    }
  });

  router.post('/posts/:postId/flags', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zCreateFlag.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const out = await createFlag(deps.db, {
        callerId: req.user.id,
        orgId: req.user.orgId,
        targetType: 'post',
        postId: req.params.postId!,
        targetId: req.params.postId!,
        reason: parsed.data.reason,
        ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  router.post('/posts/:postId/reactions', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zToggleReaction.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);
      const out = await toggleReaction(deps.db, {
        callerId: req.user.id,
        callerRole: req.user.role,
        orgId: req.user.orgId,
        targetType: 'post',
        postId: req.params.postId!,
        targetId: req.params.postId!,
        emoji: parsed.data.emoji,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  router.post('/posts/:postId/pray', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const out = await togglePrayer(deps.db, {
        callerId: req.user.id,
        orgId: req.user.orgId,
        postId: req.params.postId!,
      });
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
