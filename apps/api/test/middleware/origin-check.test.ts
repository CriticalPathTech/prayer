import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { errorHandler } from '../../src/middleware/error.js';
import { buildOriginCheck } from '../../src/middleware/origin-check.js';

function buildTestApp(allowed: string[]): express.Express {
  const app = express();
  app.use(buildOriginCheck(allowed));
  app.post('/mutating', (_req, res) => res.status(204).end());
  app.get('/reading', (_req, res) => res.status(200).json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('origin-check middleware', () => {
  const allowed = ['https://lakeside.prays.online'];

  it('passes a request with no Origin header (server-to-server)', async () => {
    const res = await request(buildTestApp(allowed)).post('/mutating');
    expect(res.status).toBe(204);
  });

  it('passes a request with an allowed Origin', async () => {
    const res = await request(buildTestApp(allowed))
      .post('/mutating')
      .set('Origin', 'https://lakeside.prays.online');
    expect(res.status).toBe(204);
  });

  it('rejects a request with a non-allowed Origin', async () => {
    const res = await request(buildTestApp(allowed))
      .post('/mutating')
      .set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('passes non-mutating verbs regardless of Origin', async () => {
    const res = await request(buildTestApp(allowed))
      .get('/reading')
      .set('Origin', 'https://evil.example');
    expect(res.status).toBe(200);
  });
});
