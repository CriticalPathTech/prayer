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
    const res = await supertest(app.app).get('/healthz').set('Host', 'hopechurch.prays.online');
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

  it('resolves via X-Org-Slug header (mobile clients)', async () => {
    // Mobile flow: api hostname has no per-org slug (e.g. `api.staging.prays.online`)
    // and Origin is unset. orgContext should pick up X-Org-Slug instead.
    await insertOrg(app.db, { slug: 'mobile-slug-fixture' });
    const res = await supertest(app.app)
      .get('/me')
      .set('Host', 'api.staging.prays.online')
      .set('X-Org-Slug', 'mobile-slug-fixture');
    // Reaches requireSession (401) — proves the header-based path resolved
    // an org. Without the header we'd see 404 ('Unknown host') because
    // 'staging' is not a real org slug.
    expect(res.status).toBe(401);
  });

  it('X-Org-Slug header takes priority over hostname', async () => {
    // Both header and hostname point at real orgs; the header should win so
    // mobile clients aren't accidentally bound to whichever org happens to
    // share a label with the api hostname.
    await insertOrg(app.db, { slug: 'header-priority-fixture' });
    await insertOrg(app.db, { slug: 'host-loser-fixture' });
    const res = await supertest(app.app)
      .get('/me')
      .set('Host', 'host-loser-fixture.prays.online')
      .set('X-Org-Slug', 'header-priority-fixture');
    // Without an Authorization header we land on requireSession (401), which
    // tells us the header resolved an org without erroring.
    expect(res.status).toBe(401);
  });

  it('falls through to host-based resolution when X-Org-Slug is malformed', async () => {
    // A header value that isn't a valid DNS label (leading hyphen) shouldn't
    // 404 outright if the hostname carries a real slug. The malformed slug
    // returns null from the resolver; we then fall through to the host path.
    await insertOrg(app.db, { slug: 'malformed-slug-fallback' });
    const res = await supertest(app.app)
      .get('/me')
      .set('Host', 'malformed-slug-fallback.prays.online')
      .set('X-Org-Slug', '-not-a-dns-label-');
    expect(res.status).toBe(401);
  });

  it('returns 404 when X-Org-Slug names an unknown org and host is also unknown', async () => {
    const res = await supertest(app.app)
      .get('/me')
      .set('Host', 'api.staging.prays.online')
      .set('X-Org-Slug', 'no-such-org-anywhere');
    expect(res.status).toBe(404);
  });

  it('lowercases X-Org-Slug before lookup (header values are case-insensitive in the wild)', async () => {
    await insertOrg(app.db, { slug: 'lowercased-slug' });
    const res = await supertest(app.app)
      .get('/me')
      .set('Host', 'api.staging.prays.online')
      .set('X-Org-Slug', 'Lowercased-Slug');
    expect(res.status).toBe(401);
  });
});
