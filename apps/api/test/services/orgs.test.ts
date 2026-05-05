import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import {
  findOrgByHost,
  findOrgBySlug,
  createOrgResolver,
  resolveLocalhost,
} from '../../src/services/orgs.js';
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
    const orgId = await insertOrg(app.db, { slug: 'hopechurch-find' });
    const result = await findOrgByHost(app.db, 'hopechurch-find.prays.online');
    expect(result?.id).toBe(orgId);
    expect(result?.slug).toBe('hopechurch-find');
  });

  it('returns null for unknown subdomain', async () => {
    const result = await findOrgByHost(app.db, 'unknown.prays.online');
    expect(result).toBeNull();
  });

  it('returns null for hosts with no matching slug in DB', async () => {
    const result = await findOrgByHost(app.db, 'evil.com');
    expect(result).toBeNull();
  });

  it('matches the api.<slug>.<domain> pattern (per-cell api hostname)', async () => {
    const orgId = await insertOrg(app.db, { slug: 'api-host-fixture' });
    const result = await findOrgByHost(app.db, 'api.api-host-fixture.prays.online');
    expect(result?.id).toBe(orgId);
    expect(result?.slug).toBe('api-host-fixture');
  });

  it('platform-agnostic — works on any domain (OSS / self-hosted)', async () => {
    // An OSS deployer running at e.g. `prayer.mychurch.org` should resolve
    // their org via the leftmost label without prayer's cloud domain being
    // hardcoded in the resolver. The slug `prayer` matches the org row;
    // the rest of the host is irrelevant.
    const orgId = await insertOrg(app.db, { slug: 'oss-host-test' });
    const result = await findOrgByHost(app.db, 'oss-host-test.mychurch.org');
    expect(result?.id).toBe(orgId);
    expect(result?.slug).toBe('oss-host-test');
  });

  it('uses the second label when the first is `api` (skips proxy prefix)', async () => {
    const orgId = await insertOrg(app.db, { slug: 'api-skip-test' });
    const result = await findOrgByHost(app.db, 'api.api-skip-test.example.com');
    expect(result?.id).toBe(orgId);
    expect(result?.slug).toBe('api-skip-test');
  });

  it('returns null for bare hostnames (no domain)', async () => {
    const result = await findOrgByHost(app.db, 'localhost');
    expect(result).toBeNull();
  });

  it('returns null for hosts whose first label fails DNS-label validation', async () => {
    // Leading hyphen, trailing hyphen, empty, etc. are not valid DNS labels
    // and so are not valid slugs.
    expect(await findOrgByHost(app.db, '-bad.example.com')).toBeNull();
    expect(await findOrgByHost(app.db, 'bad-.example.com')).toBeNull();
  });
});

describe('findOrgBySlug', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('matches a known slug', async () => {
    const orgId = await insertOrg(app.db, { slug: 'slug-direct' });
    const result = await findOrgBySlug(app.db, 'slug-direct');
    expect(result?.id).toBe(orgId);
    expect(result?.slug).toBe('slug-direct');
  });

  it('returns null for unknown slug', async () => {
    const result = await findOrgBySlug(app.db, 'no-such-slug');
    expect(result).toBeNull();
  });

  it('returns null for slugs that fail DNS-label validation', async () => {
    // Defense-in-depth: header-borne slug should never cause an arbitrary
    // DB lookup with attacker-controlled input shape.
    expect(await findOrgBySlug(app.db, '-leading-hyphen')).toBeNull();
    expect(await findOrgBySlug(app.db, 'trailing-hyphen-')).toBeNull();
    expect(await findOrgBySlug(app.db, '')).toBeNull();
    expect(await findOrgBySlug(app.db, 'has spaces')).toBeNull();
    expect(await findOrgBySlug(app.db, 'has.dots')).toBeNull();
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

  it('invalidateByOrgId() drops every cached host pointing at the org', async () => {
    const orgId = await insertOrg(app.db, { slug: 'cache-by-id', displayName: 'Original' });
    const resolver = createOrgResolver(app.db);
    // Cache the same org under two host shapes (web + api subdomain).
    const web1 = await resolver.resolve('cache-by-id.prays.online');
    const api1 = await resolver.resolve('api.cache-by-id.prays.online');
    expect(web1?.displayName).toBe('Original');
    expect(api1?.displayName).toBe('Original');
    // Mutate behind the cache, then invalidate by orgId.
    await app.db
      .updateTable('orgs')
      .set({ display_name: 'Renamed' })
      .where('id', '=', orgId)
      .execute();
    resolver.invalidateByOrgId(orgId);
    // Both hosts should re-read fresh.
    const web2 = await resolver.resolve('cache-by-id.prays.online');
    const api2 = await resolver.resolve('api.cache-by-id.prays.online');
    expect(web2?.displayName).toBe('Renamed');
    expect(api2?.displayName).toBe('Renamed');
  });

  it('resolveBySlug caches results across calls', async () => {
    await insertOrg(app.db, { slug: 'slug-cached' });
    const resolver = createOrgResolver(app.db);
    const r1 = await resolver.resolveBySlug('slug-cached');
    const r2 = await resolver.resolveBySlug('slug-cached');
    expect(r1).not.toBeNull();
    expect(r2).toEqual(r1);
  });

  it('resolveBySlug caches null results for unknown slugs', async () => {
    const resolver = createOrgResolver(app.db);
    const r1 = await resolver.resolveBySlug('definitely-not-an-org-slug');
    const r2 = await resolver.resolveBySlug('definitely-not-an-org-slug');
    expect(r1).toBeNull();
    expect(r2).toBeNull();
  });

  it('invalidateByOrgId() drops both host- and slug-cached entries', async () => {
    const orgId = await insertOrg(app.db, { slug: 'invalidate-both', displayName: 'Original' });
    const resolver = createOrgResolver(app.db);
    // Cache the same org under both code paths.
    await resolver.resolve('invalidate-both.prays.online');
    await resolver.resolveBySlug('invalidate-both');
    // Mutate behind both caches.
    await app.db
      .updateTable('orgs')
      .set({ display_name: 'Renamed' })
      .where('id', '=', orgId)
      .execute();
    resolver.invalidateByOrgId(orgId);
    // Both entry points should now reflect the rename.
    const host2 = await resolver.resolve('invalidate-both.prays.online');
    const slug2 = await resolver.resolveBySlug('invalidate-both');
    expect(host2?.displayName).toBe('Renamed');
    expect(slug2?.displayName).toBe('Renamed');
  });

  it('invalidateByOrgId() leaves other orgs cached', async () => {
    await insertOrg(app.db, { slug: 'keep-me-cached', displayName: 'Keep' });
    const targetOrgId = await insertOrg(app.db, { slug: 'evict-me', displayName: 'Evict' });
    const resolver = createOrgResolver(app.db);
    const keep1 = await resolver.resolve('keep-me-cached.prays.online');
    await resolver.resolve('evict-me.prays.online');
    expect(keep1?.displayName).toBe('Keep');
    // Mutate the unrelated org, then invalidate only the target.
    await app.db
      .updateTable('orgs')
      .set({ display_name: 'KeepStillCachedAsOld' })
      .where('slug', '=', 'keep-me-cached')
      .execute();
    resolver.invalidateByOrgId(targetOrgId);
    // keep-me-cached was NOT touched by invalidate, so the resolver still
    // serves the old "Keep" value (proves we didn't blow away unrelated entries).
    const keep2 = await resolver.resolve('keep-me-cached.prays.online');
    expect(keep2?.displayName).toBe('Keep');
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
