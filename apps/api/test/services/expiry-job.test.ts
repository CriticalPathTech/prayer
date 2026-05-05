import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { createLogger } from '../../src/lib/logger.js';
import { sweepExpired } from '../../src/services/expiry-job.js';
import { insertOrg, insertPost, insertUser } from '../helpers/seed.js';

describe('sweepExpired', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'testchurch-svc-expiry' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('archives only expired+published posts', async () => {
    const user = await insertUser(db, { orgId });
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 24 * 3600_000);
    const expiredPub = await insertPost(db, {
      authorId: user.id,
      orgId,
      status: 'published',
      expiresAt: past,
    });
    const freshPub = await insertPost(db, {
      authorId: user.id,
      orgId,
      status: 'published',
      expiresAt: future,
    });
    const expiredDraft = await insertPost(db, {
      authorId: user.id,
      orgId,
      status: 'draft',
      expiresAt: past,
    });

    const n = await sweepExpired(db, { logger: createLogger('silent') });
    expect(n).toBe(1);

    const rows = await db.selectFrom('posts').select(['id', 'status']).execute();
    const byId = new Map(rows.map((r) => [r.id, r.status]));
    expect(byId.get(expiredPub.id)).toBe('archived');
    expect(byId.get(freshPub.id)).toBe('published');
    expect(byId.get(expiredDraft.id)).toBe('draft');
  });

  it('is idempotent on repeat runs', async () => {
    const user = await insertUser(db, { orgId });
    const past = new Date(Date.now() - 60_000);
    await insertPost(db, { authorId: user.id, orgId, status: 'published', expiresAt: past });
    const n1 = await sweepExpired(db, { logger: createLogger('silent') });
    const n2 = await sweepExpired(db, { logger: createLogger('silent') });
    expect(n1).toBe(1);
    expect(n2).toBe(0);
  });

  it('archives matching rows without writing any events', async () => {
    const user = await insertUser(db, { orgId });
    const past = new Date(Date.now() - 60_000);
    await insertPost(db, { authorId: user.id, orgId, status: 'published', expiresAt: past });
    await insertPost(db, { authorId: user.id, orgId, status: 'published', expiresAt: past });
    await sweepExpired(db, { logger: createLogger('silent') });
    const archived = await db
      .selectFrom('posts')
      .select('id')
      .where('status', '=', 'archived')
      .execute();
    expect(archived).toHaveLength(2);
    const evts = await db.selectFrom('events').select('type').execute();
    expect(evts).toHaveLength(0);
  });
});
