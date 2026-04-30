import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { insertOrg } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('orgContext middleware', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('healthz works without orgContext (mounted before middleware)', async () => {
    const res = await supertest(app.app).get('/healthz').set('Host', 'lakeside.prays.online');
    expect(res.status).toBe(200);
  });

  it('rejects unknown host with 404 on a protected route', async () => {
    const res = await supertest(app.app).get('/me').set('Host', 'unknown.prays.online');
    expect(res.status).toBe(404);
  });

  it('localhost with multiple orgs in DB returns 500 with clear error', async () => {
    // The shared test DB likely has multiple orgs from other test files.
    // resolveLocalhost throws when ambiguous; orgContext should propagate to a 500.
    await insertOrg(app.db, { slug: 'multi-1' });
    await insertOrg(app.db, { slug: 'multi-2' });
    const res = await supertest(app.app).get('/me').set('Host', 'localhost');
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
