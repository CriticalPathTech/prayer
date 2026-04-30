import type { Database } from '@prayer/db';
import { loadApiEnv } from '@prayer/shared';
import express from 'express';
import type { Kysely } from 'kysely';
import supertest from 'supertest';

import { buildApp, type AppDependencies } from '../../src/app.js';
import { initDb } from '../../src/db/index.js';
import { createJwtVerifier } from '../../src/lib/jwt.js';
import { createLogger } from '../../src/lib/logger.js';

import { makeInMemoryStorage, type InMemoryStorage } from './storage.js';

export interface CreateTestAppOptions {
  host?: string; // default 'lakeside.prays.online'
}

export interface TestApp {
  app: import('express').Express;
  /** Supertest agent with Host header pre-set (default lakeside.prays.online). */
  agent: ReturnType<typeof supertest.agent>;
  db: Kysely<Database>;
  storage: InMemoryStorage;
  /** The org ID for the default host ('lakeside'). Use this when inserting users
   *  that need to authenticate against the default test host. */
  orgId: string;
  close: () => Promise<void>;
}

export async function createTestApp(opts: CreateTestAppOptions = {}): Promise<TestApp> {
  const host = opts.host ?? 'lakeside.prays.online';
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
  const inner = buildApp(deps);

  // Wrap with a host-normalisation shim: when supertest issues a raw request
  // (no explicit Host set), the Host header arrives as "127.0.0.1:<port>".
  // orgContext would then invoke resolveLocalhost, which throws when the test
  // DB has multiple orgs. To keep existing tests unmodified we inject the
  // default test host in that case, so orgContext always resolves to the
  // "lakeside" org (seeded in global-setup).
  const wrapper = express();
  wrapper.use((req, _res, next) => {
    const h = req.headers.host ?? '';
    if (!h || h.startsWith('127.0.0.1') || h.startsWith('::1')) {
      req.headers.host = host;
    }
    next();
  });
  wrapper.use(inner);

  // Resolve the org ID for this host's slug so tests can insert users into the
  // matching org without creating a separate fixture org.
  const hostSlug = host.split('.')[0]!; // 'lakeside.prays.online' → 'lakeside'
  const orgRow = await db
    .selectFrom('orgs')
    .select('id')
    .where('slug', '=', hostSlug)
    .executeTakeFirstOrThrow();

  const agent = supertest.agent(wrapper).host(host);
  return {
    app: wrapper,
    agent,
    db,
    storage,
    orgId: orgRow.id,
    close: async () => {
      await db.destroy();
    },
  };
}
