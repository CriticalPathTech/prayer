import { randomUUID } from 'node:crypto';

import { newId } from '@prayer/db';
import type { UserRole } from '@prayer/db';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { createJwtVerifier } from '../../src/lib/jwt.js';
import {
  requireAuth,
  requireMember,
  requireModerator,
  requireSuperUser,
} from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/error.js';
import { mintTestJwt } from '../helpers/jwt.js';

const db = initDb(process.env.TEST_DATABASE_URL!);
const verifier = createJwtVerifier(process.env.AUTH_JWKS_URL!);

async function createUserWithRole(role: UserRole): Promise<{ sub: string; token: string }> {
  const sub = randomUUID();
  const email = `${role}-${Math.random().toString(36).slice(2, 8)}@x.com`;
  await db
    .insertInto('users')
    .values({ id: newId(), supabase_auth_id: sub, email, display_name: email, role })
    .execute();
  const token = await mintTestJwt({ sub, email });
  return { sub, token };
}

function appWith(guard: ReturnType<typeof requireMember>) {
  const app = express();
  app.use(requireAuth({ db, jwtVerifier: verifier }));
  app.get('/g', guard, (req, res) => res.json({ role: req.user?.role }));
  app.use(errorHandler);
  return app;
}

afterEach(async () => {
  await db.deleteFrom('users').execute();
});

afterAll(async () => {
  await db.destroy();
});

describe('role guards', () => {
  it('requireMember allows member', async () => {
    const { token } = await createUserWithRole('member');
    const res = await request(appWith(requireMember()))
      .get('/g')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('requireMember allows moderator and super_user', async () => {
    for (const role of ['moderator', 'super_user'] as const) {
      const { token } = await createUserWithRole(role);
      const res = await request(appWith(requireMember()))
        .get('/g')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
  });

  it('requireModerator rejects member with 403', async () => {
    const { token } = await createUserWithRole('member');
    const res = await request(appWith(requireModerator()))
      .get('/g')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('requireModerator allows moderator and super_user', async () => {
    for (const role of ['moderator', 'super_user'] as const) {
      const { token } = await createUserWithRole(role);
      const res = await request(appWith(requireModerator()))
        .get('/g')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
  });

  it('requireSuperUser rejects member and moderator with 403', async () => {
    for (const role of ['member', 'moderator'] as const) {
      const { token } = await createUserWithRole(role);
      const res = await request(appWith(requireSuperUser()))
        .get('/g')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it('requireSuperUser allows super_user', async () => {
    const { token } = await createUserWithRole('super_user');
    const res = await request(appWith(requireSuperUser()))
      .get('/g')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
