import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from '@prayer/db';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import { buildApp } from './app.js';
import { env } from './config/env.js';
import { initDb } from './db/index.js';
import { createJwtVerifier } from './lib/jwt.js';
import { createLogger } from './lib/logger.js';

async function main(): Promise<void> {
  const cfg = env();
  const logger = createLogger(cfg.LOG_LEVEL);

  logger.info({ event: 'migrate:start' });
  await migrate({ direction: 'up', databaseUrl: cfg.DATABASE_URL });
  logger.info({ event: 'migrate:complete' });

  const db = initDb(cfg.DATABASE_URL);
  const jwtVerifier = createJwtVerifier(cfg.AUTH_JWKS_URL, {
    ...(cfg.AUTH_ISSUER ? { issuer: cfg.AUTH_ISSUER } : {}),
  });
  const app = buildApp({
    db,
    env: cfg,
    jwtVerifier,
    logger,
    corsOrigin: cfg.CORS_ORIGIN,
    gitSha: cfg.GIT_SHA,
    rateLimitEnabled: cfg.RATE_LIMIT_ENABLED,
    databaseUrl: cfg.DATABASE_URL,
  });

  app.listen(cfg.PORT, () => {
    logger.info({ event: 'listening', port: cfg.PORT, version: cfg.GIT_SHA });
  });

  const locals = (
    app as unknown as {
      locals: {
        expirySweeper?: { stop: () => void };
        pinSweeper?: { stop: () => void };
        imageReaper?: { stop: () => void };
        eventWorker?: { stop: () => Promise<void> } | null;
      };
    }
  ).locals;
  const shutdown = async (): Promise<void> => {
    locals.expirySweeper?.stop();
    locals.pinSweeper?.stop();
    locals.imageReaper?.stop();
    await locals.eventWorker?.stop();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
