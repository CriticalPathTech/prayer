import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { createLogger } from '../../src/lib/logger.js';
import { createImageReaper } from '../../src/services/image-reaper-job.js';
import { uploadPostImage } from '../../src/services/post-images.js';
import { getTestchurchOrgId, insertPost, insertUser, makeJpeg } from '../helpers/seed.js';
import { makeInMemoryStorage, type InMemoryStorage } from '../helpers/storage.js';

describe('image reaper job', () => {
  let db: Kysely<Database>;
  let orgId: string;
  let storage: InMemoryStorage;

  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await getTestchurchOrgId(db);
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('post_images').execute();
    await db.deleteFrom('posts').execute();
  });

  it('runOnce reaps unattached rows older than 24h, is idempotent, and spares attached/fresh rows', async () => {
    const user = await insertUser(db, { orgId });
    storage = makeInMemoryStorage();

    const stale = await uploadPostImage(db, storage, {
      ownerId: user.id,
      orgId,
      bytes: await makeJpeg(60, 60),
    });
    await db
      .updateTable('post_images')
      .set({ created_at: new Date(Date.now() - 30 * 3600_000) })
      .where('id', '=', stale.id)
      .execute();

    // Attached row, also stale by created_at, must survive because post_id is set.
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'draft' });
    const attached = await uploadPostImage(db, storage, {
      ownerId: user.id,
      orgId,
      bytes: await makeJpeg(60, 60),
    });
    await db
      .updateTable('post_images')
      .set({ post_id: post.id, created_at: new Date(Date.now() - 30 * 3600_000) })
      .where('id', '=', attached.id)
      .execute();

    // Fresh orphan, well within the window, must survive.
    const freshOrphan = await uploadPostImage(db, storage, {
      ownerId: user.id,
      orgId,
      bytes: await makeJpeg(60, 60),
    });

    const reaper = createImageReaper({ db, storage, logger: createLogger('silent') });

    expect(await reaper.runOnce()).toBe(1);
    expect(await reaper.runOnce()).toBe(0);

    const remaining = await db.selectFrom('post_images').select('id').execute();
    expect(remaining.map((r) => r.id).sort()).toEqual([attached.id, freshOrphan.id].sort());
  });
});
