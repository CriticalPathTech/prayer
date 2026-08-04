import type { Database } from '@prayer/db';
import type { ApiEnv } from '@prayer/shared';
import cors from 'cors';
import express, { type Express } from 'express';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

import type { JwtVerifier } from './lib/jwt.js';
import { createStorageClient, type StorageClient } from './lib/storage.js';
import {
  requireAuth,
  requireMember,
  requireModerator,
  requireSession,
  requireSuperUser,
} from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { orgContext } from './middleware/org-context.js';
import { buildOriginCheck } from './middleware/origin-check.js';
import {
  ACCEPT_SCOPE,
  GLOBAL_SCOPE,
  PREVIEW_SCOPE,
  REACTION_SCOPE,
  WRITE_SCOPE,
  buildLimiter,
} from './middleware/rate-limit.js';
import { adminChurchRouter } from './routes/admin-church.js';
import { commentsRouter } from './routes/comments.js';
import { feedRouter } from './routes/feed.js';
import { healthRouter } from './routes/health.js';
import { invitationsRedeemRouter } from './routes/invitations.js';
import { publicInviteCodesRouter } from './routes/invite-codes.js';
import { meDraftRouter } from './routes/me-draft.js';
import { meImagesRouter } from './routes/me-images.js';
import { meOrgsRouter } from './routes/me-orgs.js';
import { meRouter } from './routes/me.js';
import { modApprovalsRouter } from './routes/mod-approvals.js';
import { modFollowupRouter } from './routes/mod-followup.js';
import { modInviteCodesRouter } from './routes/mod-invite-codes.js';
import { modPostsExtendRouter } from './routes/mod-posts-extend.js';
import { modPostsPinRouter } from './routes/mod-posts-pin.js';
import { moderationRouter } from './routes/moderation.js';
import { notificationsRouter } from './routes/notifications.js';
import { orgRouter } from './routes/org.js';
import { postsRouter } from './routes/posts.js';
import { usersRouter } from './routes/users.js';
import { createEventWorker, type EventHandler, type EventWorker } from './services/event-worker.js';
import { createExpirySweeper, type ExpiryJobHandle } from './services/expiry-job.js';
import { flagConsumer } from './services/flag-consumer.js';
import { commentCreatedBuilder } from './services/notification-builders/comment-created.js';
import { flagCreatedBuilder } from './services/notification-builders/flag-created.js';
import { inviteAcceptedBuilder } from './services/notification-builders/invite-accepted.js';
import { moderatorHideBuilder } from './services/notification-builders/moderator-hide.js';
import { postExtendedBuilder } from './services/notification-builders/post-extended.js';
import { postRejectedBuilder } from './services/notification-builders/post-rejected.js';
import { createOrgResolver } from './services/orgs.js';
import { createPinSweeper, type PinJobHandle } from './services/pin-job.js';
import { prayerCountRecomputer } from './services/prayer-consumer.js';
import { reactionCountRecomputer } from './services/reaction-consumer.js';

// M6: wires notifications router + comment-created builder (see notification-builders/).
export interface AppDependencies {
  db: Kysely<Database>;
  env: ApiEnv;
  jwtVerifier: JwtVerifier;
  logger: Logger;
  corsOrigin: string | string[];
  gitSha: string;
  rateLimitEnabled?: boolean;
  /** Raw Postgres connection string for the event worker's LISTEN client.
   * If absent, the worker is not started (useful in tests). */
  databaseUrl?: string;
  /** Storage client (S3-compatible). Tests inject an in-memory fake. */
  storage?: StorageClient;
  /** Base URL used to build public avatar URLs (e.g. https://avatars.cdn.example.com). */
  publicUrlBase?: string;
}

export function buildApp(deps: AppDependencies): Express {
  const app = express();
  const startedAt = Date.now();

  // Railway's X-Forwarded-For has two hops — the real client, then Railway's
  // internal proxy (a rotating mesh IP). Trust 2 hops to land on the real
  // client IP; anything less keys rate-limiters off the rotating proxy.
  app.set('trust proxy', 2);

  app.use(pinoHttp({ logger: deps.logger }));
  app.use(cors({ origin: deps.corsOrigin, credentials: false }));
  const corsList = Array.isArray(deps.corsOrigin) ? deps.corsOrigin : [deps.corsOrigin];
  app.use(buildOriginCheck(corsList));
  // /me/avatar accepts a base64 data URL (up to ~2.67MB encoded for a 2MB decoded
  // image). Skip the 1MB global json limit for that route; the route-level
  // express.json({ limit: '3mb' }) runs afterwards.
  const jsonLimited = express.json({ limit: '1mb' });
  app.use((req, res, next) => {
    if (req.path === '/me/avatar') return next();
    return jsonLimited(req, res, next);
  });

  const storage =
    deps.storage ??
    createStorageClient({
      endpoint: deps.env.S3_ENDPOINT,
      region: deps.env.S3_REGION,
      accessKeyId: deps.env.S3_ACCESS_KEY,
      secretAccessKey: deps.env.S3_SECRET_KEY,
      forcePathStyle: deps.env.S3_FORCE_PATH_STYLE,
    });
  const publicUrlBase = deps.publicUrlBase ?? deps.env.STORAGE_PUBLIC_URL_BASE;

  const rateLimitActive = process.env.NODE_ENV !== 'test' && (deps.rateLimitEnabled ?? true);
  if (rateLimitActive) {
    app.use('/invite-codes', buildLimiter(PREVIEW_SCOPE));
    app.use('/invitations/redeem', buildLimiter(ACCEPT_SCOPE));
    app.use(
      ['/posts', '/posts/:id/updates', '/posts/:id/comments', '/me/avatar', '/me/images'],
      (req, res, next) => {
        if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') {
          return buildLimiter(WRITE_SCOPE)(req, res, next);
        }
        next();
      },
    );
    app.use(
      ['/posts/:id/reactions', '/posts/:id/prayers', '/posts/:id/flags'],
      (req, res, next) => {
        if (req.method === 'POST' || req.method === 'DELETE') {
          return buildLimiter(REACTION_SCOPE)(req, res, next);
        }
        next();
      },
    );
    app.use(buildLimiter(GLOBAL_SCOPE));
  }

  app.use(healthRouter({ db: deps.db, gitSha: deps.gitSha, startedAt }));
  app.use(publicInviteCodesRouter({ db: deps.db }));

  // /me/orgs is auth-gated but org-context-exempt: the caller hasn't picked an
  // org yet (this is the endpoint that tells them what they can pick from).
  // Mount it BEFORE the global orgContext so it doesn't 404 on missing slug/host.
  // Path-scope the mount so requireSession doesn't blanket-reject unrelated
  // public routes that come later in the chain (e.g. /org).
  app.use(
    '/me/orgs',
    requireSession({ jwtVerifier: deps.jwtVerifier }),
    meOrgsRouter({ db: deps.db }),
  );

  const orgResolver = createOrgResolver(deps.db);
  app.use(orgContext({ db: deps.db, resolver: orgResolver }));

  app.use(orgRouter({ db: deps.db }));

  app.use(
    requireSession({ jwtVerifier: deps.jwtVerifier }),
    invitationsRedeemRouter({ db: deps.db }),
  );
  const auth = [requireAuth({ db: deps.db, jwtVerifier: deps.jwtVerifier }), requireMember()];
  app.use(auth, meRouter({ db: deps.db, storage, publicUrlBase }));
  app.use(auth, meImagesRouter({ db: deps.db, storage }));
  app.use(auth, meDraftRouter({ db: deps.db }));
  app.use(auth, postsRouter({ db: deps.db }));
  app.use(auth, feedRouter({ db: deps.db }));
  app.use(auth, usersRouter({ db: deps.db }));
  app.use(auth, commentsRouter({ db: deps.db }));
  app.use(auth, notificationsRouter({ db: deps.db }));
  app.use(auth, requireModerator(), moderationRouter({ db: deps.db }));
  app.use(auth, requireModerator(), modApprovalsRouter({ db: deps.db }));
  app.use(auth, requireModerator(), modFollowupRouter({ db: deps.db }));
  app.use(auth, requireModerator(), modPostsPinRouter({ db: deps.db }));
  app.use(auth, requireModerator(), modPostsExtendRouter({ db: deps.db }));
  app.use(auth, requireModerator(), modInviteCodesRouter({ db: deps.db }));
  app.use(auth, requireSuperUser(), adminChurchRouter({ db: deps.db, orgResolver }));

  const expirySweeper = createExpirySweeper({ db: deps.db, logger: deps.logger });
  const pinSweeper = createPinSweeper({ db: deps.db, logger: deps.logger });
  if (process.env.NODE_ENV !== 'test') {
    expirySweeper.start();
    pinSweeper.start();
  }
  (
    app as unknown as {
      locals: { expirySweeper: ExpiryJobHandle; pinSweeper: PinJobHandle };
    }
  ).locals.expirySweeper = expirySweeper;
  (app as unknown as { locals: { pinSweeper: PinJobHandle } }).locals.pinSweeper = pinSweeper;

  let eventWorker: EventWorker | null = null;
  if (process.env.NODE_ENV !== 'test' && deps.databaseUrl) {
    const reactionHandler: EventHandler = async (event, trx) => {
      await reactionCountRecomputer(event, trx);
    };
    const prayerHandler: EventHandler = async (event, trx) => {
      await prayerCountRecomputer(event, trx);
    };

    eventWorker = createEventWorker({
      connectionString: deps.databaseUrl,
      db: deps.db,
      logger: deps.logger,
      extraHandlers: {
        'comment.created': commentCreatedBuilder,
        'reaction.added': reactionHandler,
        'reaction.removed': reactionHandler,
        'prayer.added': prayerHandler,
        'prayer.removed': prayerHandler,
        'flag.created': async (event, trx) => {
          await flagConsumer(event, trx);
          await flagCreatedBuilder(event, trx);
        },
        'flag.resolved': flagConsumer,
        'moderator.hide': moderatorHideBuilder,
        'moderator.unhide': async () => {},
        'post.extended': postExtendedBuilder,
        'invite.accepted': inviteAcceptedBuilder,
        'post.rejected': postRejectedBuilder,
        'post.submitted': async () => {}, // no-op; reserved for future moderator-side notif
        'post.approved': async () => {}, // no-op; reserved for future audit consumer
      },
    });
    void eventWorker
      .start()
      .catch((err) => deps.logger.error({ err }, 'event-worker: start failed'));
  }
  (app as unknown as { locals: { eventWorker: EventWorker | null } }).locals.eventWorker =
    eventWorker;

  app.use(errorHandler);
  return app;
}
