import type { Database } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../../src/db/index.js';
import { flagCreatedBuilder } from '../../../src/services/notification-builders/flag-created.js';
import { insertOrg, insertPost, insertUser } from '../../helpers/seed.js';

describe('flagCreatedBuilder', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'lakeside-nb-flag-created' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('fans out one notification per moderator+super_user, excluding the flagger', async () => {
    const author = await insertUser(db, { orgId });
    const flagger = await insertUser(db, { orgId, role: 'moderator' });
    const mod2 = await insertUser(db, { orgId, role: 'moderator' });
    const su = await insertUser(db, { orgId, role: 'super_user' });
    await insertUser(db, { orgId }); // a member — should not be notified
    const post = await insertPost(db, {
      authorId: author.id,
      orgId,
      body: 'hello world',
      status: 'published',
    });

    await db.transaction().execute(async (trx) => {
      await flagCreatedBuilder(
        {
          id: newId(),
          org_id: orgId,
          type: 'flag.created',
          post_id: post.id,
          actor_id: flagger.id,
          payload: {
            flag_id: 'f1',
            target_type: 'post',
            target_id: post.id,
            reason: 'off_topic',
          },
        },
        trx,
      );
    });

    const rows = await db.selectFrom('notifications').selectAll().execute();
    expect(rows).toHaveLength(2);
    const recipients = new Set(rows.map((r) => r.user_id));
    expect(recipients).toEqual(new Set([mod2.id, su.id]));
    for (const r of rows) {
      expect(r.type).toBe('flag.created');
      expect((r.payload as { target_preview: string }).target_preview).toContain('hello world');
      expect(r.payload).not.toHaveProperty('flagger_id');
    }
  });

  it('truncates preview to 80 chars', async () => {
    const author = await insertUser(db, { orgId });
    const flagger = await insertUser(db, { orgId });
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const longBody = 'x'.repeat(150);
    const post = await insertPost(db, {
      authorId: author.id,
      orgId,
      body: longBody,
      status: 'published',
    });
    await db.transaction().execute(async (trx) => {
      await flagCreatedBuilder(
        {
          id: newId(),
          org_id: orgId,
          type: 'flag.created',
          post_id: post.id,
          actor_id: flagger.id,
          payload: { flag_id: 'f1', target_type: 'post', target_id: post.id, reason: 'off_topic' },
        },
        trx,
      );
    });
    const row = await db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', mod.id)
      .executeTakeFirst();
    expect((row!.payload as { target_preview: string }).target_preview.length).toBeLessThanOrEqual(
      80,
    );
  });
});
