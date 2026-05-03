import { loadApiEnv } from '@prayer/shared';
import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { initDb } from '../../src/db/index.js';
import { createJwtVerifier } from '../../src/lib/jwt.js';
import { errorHandler } from '../../src/middleware/error.js';
import { buildLimiter } from '../../src/middleware/rate-limit.js';

function buildTestApp(): express.Express {
  const app = express();
  const limiter = buildLimiter({ windowMs: 60_000, max: 3, keyBy: 'ip' });
  app.use('/test', limiter);
  app.post('/test', (_req, res) => res.status(204).end());
  app.use(errorHandler);
  return app;
}

describe('rate-limit middleware', () => {
  it('returns 429 with RATE_LIMITED once max requests are exceeded', async () => {
    const app = buildTestApp();
    const agent = request.agent(app);
    for (let i = 0; i < 3; i++) {
      const ok = await agent.post('/test');
      expect(ok.status).toBe(204);
    }
    const blocked = await agent.post('/test');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['ratelimit-limit']).toBeDefined();
    expect(blocked.headers['ratelimit-remaining']).toBeDefined();
  });
});

describe('rate-limit mounted in buildApp', () => {
  it('is a no-op when NODE_ENV=test (RATE_LIMIT_ENABLED ignored)', async () => {
    const env = loadApiEnv({
      ...process.env,
      NODE_ENV: 'test',
      RATE_LIMIT_ENABLED: 'true',
    });
    const db = initDb(env.DATABASE_URL);
    try {
      const app = buildApp({
        db,
        env,
        jwtVerifier: createJwtVerifier(env.AUTH_JWKS_URL),
        logger: pino({ level: 'silent' }),
        corsOrigin: env.CORS_ORIGIN,
        gitSha: 'test',
      });
      const agent = request.agent(app);
      for (let i = 0; i < 40; i++) {
        const res = await agent.get('/invite-codes/bogus');
        expect([200, 400, 404]).toContain(res.status);
      }
    } finally {
      await db.destroy();
    }
  });
});
