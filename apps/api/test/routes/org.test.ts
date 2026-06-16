import { newId } from '@prayer/db';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { saveOrgLogo } from '../../src/services/logo.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';
import { insertOrg } from '../helpers/seed.js';

describe('GET /org', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(async () => {
    // Drop any extra orgs this file inserted; leave the testchurch seed alone so
    // other suites that share the schema reset still see it.
    await ctx.db.deleteFrom('orgs').where('slug', '!=', 'testchurch').execute();
  });

  it('returns slug + displayName for the resolved host without auth', async () => {
    const res = await ctx.agent.get('/org');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      slug: 'testchurch',
      displayName: 'Testchurch (test default)',
      logo: null,
    });
  });

  it('returns the customised display_name for a different host', async () => {
    // Use a fresh slug so the orgResolver LRU has nothing cached for this host.
    await ctx.db
      .insertInto('orgs')
      .values({ id: newId(), slug: 'graceview', display_name: 'Graceview Community Church' })
      .execute();
    const res = await request(ctx.app)
      .get('/org')
      .set('Host', 'graceview.prays.online')
      .set('Origin', 'http://graceview.prays.online');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      slug: 'graceview',
      displayName: 'Graceview Community Church',
      logo: null,
    });
  });

  it('returns 404 for an unknown host', async () => {
    const res = await request(ctx.app).get('/org').set('Host', 'nope.prays.online');
    expect(res.status).toBe(404);
  });

  it('includes logo: null when the org has no custom logo', async () => {
    const res = await request(ctx.app).get('/org').set('Host', 'testchurch.prays.online');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('logo', null);
  });

  it('returns the saved logo for an org that has one', async () => {
    const orgId = await insertOrg(ctx.db, { slug: 'org-logo-host', displayName: 'Org Logo Host' });
    await saveOrgLogo(ctx.db, {
      orgId,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="currentColor" d="M0 0h10v10H0z"/></svg>',
      fillMode: 'adaptive',
    });
    const res = await request(ctx.app).get('/org').set('Host', 'org-logo-host.prays.online');
    expect(res.status).toBe(200);
    expect(res.body.logo.fillMode).toBe('adaptive');
    expect(res.body.logo.svg).toContain('<svg');
  });
});
