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

  it('uses Origin header for cross-origin requests (api at a different host than web)', async () => {
    // Browser at <slug>.prays.online calls the api at a host that doesn't
    // match the slug regex (e.g. a hosting-provider default *.up.example.com):
    //   Host   = api-fixture.up.example.com   (no slug)
    //   Origin = https://cross-origin-fixture.prays.online
    // orgContext should resolve via Origin and attach the matching org.
    await insertOrg(app.db, { slug: 'cross-origin-fixture' });
    const res = await supertest(app.app)
      .get('/me')
      .set('Host', 'api-fixture.up.example.com')
      .set('Origin', 'https://cross-origin-fixture.prays.online');
    // Without an Authorization header we'll bounce off requireSession with 401,
    // but reaching that point means orgContext succeeded (otherwise we'd see 404).
    expect(res.status).toBe(401);
  });

  it('falls back to req.hostname when Origin is malformed', async () => {
    await insertOrg(app.db, { slug: 'malformed-origin-fixture' });
    const res = await supertest(app.app)
      .get('/me')
      .set('Host', 'malformed-origin-fixture.prays.online')
      .set('Origin', 'not-a-valid-url');
    // Reaches requireSession (401) — proves orgContext resolved via req.hostname
    // after the malformed Origin failed URL parsing.
    expect(res.status).toBe(401);
  });
});
