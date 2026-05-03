import { randomUUID } from 'node:crypto';

import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { createJwtVerifier } from '../../src/lib/jwt.js';
import { requireAuth } from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/error.js';
import { mintExpiredJwt, mintTestJwt } from '../helpers/jwt.js';

const db = initDb(process.env.TEST_DATABASE_URL!);
const verifier = createJwtVerifier(process.env.AUTH_JWKS_URL!);

function buildTestApp() {
  const app = express();
  app.use(requireAuth({ db, jwtVerifier: verifier }));
  app.get('/protected', (req, res) => res.json({ user: req.user }));
  app.use(errorHandler);
  return app;
}

afterAll(async () => {
  await db.destroy();
});

afterEach(async () => {
  await db.deleteFrom('users').execute();
});

describe('requireAuth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(buildTestApp()).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when token is malformed', async () => {
    const res = await request(buildTestApp())
      .get('/protected')
      .set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is expired', async () => {
    const sub = randomUUID();
    const token = await mintExpiredJwt({ sub, email: 'e@x.com' });
    const res = await request(buildTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 ONBOARDING_REQUIRED when token is valid but no users row exists', async () => {
    const sub = randomUUID();
    const token = await mintTestJwt({ sub, email: 'newbie@x.com' });
    const res = await request(buildTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ONBOARDING_REQUIRED');
    const rows = await db.selectFrom('users').selectAll().execute();
    expect(rows).toHaveLength(0);
  });
});
