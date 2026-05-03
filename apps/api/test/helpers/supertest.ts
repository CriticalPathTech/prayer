import type { Database } from '@prayer/db';
import { loadApiEnv } from '@prayer/shared';
import type { Kysely } from 'kysely';

import { buildApp, type AppDependencies } from '../../src/app.js';
import { initDb } from '../../src/db/index.js';
import { createJwtVerifier } from '../../src/lib/jwt.js';
import { createLogger } from '../../src/lib/logger.js';

import { makeInMemoryStorage, type InMemoryStorage } from './storage.js';

export interface TestApp {
  app: import('express').Express;
  db: Kysely<Database>;
  storage: InMemoryStorage;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const db = initDb(process.env.TEST_DATABASE_URL!);
  const storage = makeInMemoryStorage();
  const env = loadApiEnv();
  const deps: AppDependencies = {
    db,
    env,
    jwtVerifier: createJwtVerifier(process.env.AUTH_JWKS_URL!),
    logger: createLogger('silent'),
    corsOrigin: 'http://localhost:5173',
    gitSha: 'test',
    storage,
    publicUrlBase: 'https://example.supabase.co/storage/v1/object/public/avatars',
  };
  const app = buildApp(deps);
  return {
    app,
    db,
    storage,
    close: async () => {
      await db.destroy();
    },
  };
}
