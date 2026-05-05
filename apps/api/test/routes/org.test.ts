import { newId } from '@prayer/db';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from '../helpers/supertest.js';

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
    });
  });

  it('returns 404 for an unknown host', async () => {
    const res = await request(ctx.app).get('/org').set('Host', 'nope.prays.online');
    expect(res.status).toBe(404);
  });
});
