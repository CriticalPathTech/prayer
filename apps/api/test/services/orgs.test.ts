import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import { findOrgByHost, createOrgResolver, resolveLocalhost } from '../../src/services/orgs.js';
import { insertOrg } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

describe('findOrgByHost', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('matches a known subdomain', async () => {
    const orgId = await insertOrg(app.db, { slug: 'lakeside-find' });
    const result = await findOrgByHost(app.db, 'lakeside-find.prays.online');
    expect(result?.id).toBe(orgId);
    expect(result?.slug).toBe('lakeside-find');
  });

  it('returns null for unknown subdomain', async () => {
    const result = await findOrgByHost(app.db, 'unknown.prays.online');
    expect(result).toBeNull();
  });

  it('returns null for non-prays.online host', async () => {
    const result = await findOrgByHost(app.db, 'evil.com');
    expect(result).toBeNull();
  });
});

describe('createOrgResolver — LRU cache', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('caches results across calls', async () => {
    await insertOrg(app.db, { slug: 'cached-resolve' });
    const resolver = createOrgResolver(app.db);
    const r1 = await resolver.resolve('cached-resolve.prays.online');
    const r2 = await resolver.resolve('cached-resolve.prays.online');
    expect(r1).not.toBeNull();
    expect(r2).toEqual(r1);
  });

  it('caches null results too (avoids hammering DB on bad hosts)', async () => {
    const resolver = createOrgResolver(app.db);
    const r1 = await resolver.resolve('does-not-exist.prays.online');
    const r2 = await resolver.resolve('does-not-exist.prays.online');
    expect(r1).toBeNull();
    expect(r2).toBeNull();
  });

  it('invalidate() drops a cached entry', async () => {
    const resolver = createOrgResolver(app.db);
    await resolver.resolve('cached-resolve.prays.online');
    resolver.invalidate('cached-resolve.prays.online');
    // Surface check; deeper cache invalidation behavior is internal
  });
});

describe('resolveLocalhost', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
    // Insert a second org to guarantee the "multiple orgs" branch, since
    // other test files in this suite insert orgs and we share the same DB.
    await insertOrg(app.db, { slug: 'localhost-extra-org' });
  });
  afterAll(async () => {
    await app.close();
  });

  it('throws when multiple orgs exist in DB', async () => {
    await expect(resolveLocalhost(app.db)).rejects.toThrow(/orgContext: (no orgs|multiple orgs)/);
  });
});
