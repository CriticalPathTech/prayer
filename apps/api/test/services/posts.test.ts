import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { ForbiddenError } from '../../src/middleware/error.js';
import { publishOwnDraft } from '../../src/services/posts.js';
import { getTestchurchOrgId, insertPost, insertUser } from '../helpers/seed.js';

describe('publishOwnDraft pin', () => {
  let db: Kysely<Database>;
  let orgId: string;

  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await getTestchurchOrgId(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  afterEach(async () => {
    await db.deleteFrom('posts').where('org_id', '=', orgId).execute();
    await db
      .deleteFrom('user_orgs')
      .where('org_id', '=', orgId)
      .execute();
  });

  it('moderator with pinDurationDays=7 publishes with all three pin columns set', async () => {
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    await insertPost(db, {
      authorId: mod.id,
      orgId,
      status: 'draft',
      body: 'pinned at publish',
    });

    const dto = await publishOwnDraft(db, {
      userId: mod.id,
      orgId,
      callerRole: 'moderator',
      pinDurationDays: 7,
    });

    expect(dto.pinned_at).not.toBeNull();
    const row = await db
      .selectFrom('posts')
      .select(['pinned_at', 'pin_until', 'pinned_by'])
      .where('id', '=', dto.id)
      .executeTakeFirstOrThrow();
    expect(row.pinned_at).not.toBeNull();
    expect(row.pinned_by).toBe(mod.id);
    // pin_until ≈ pinned_at + 7 days (allow 5s slack)
    const delta = row.pin_until!.getTime() - row.pinned_at!.getTime();
    expect(delta).toBeGreaterThan(7 * 86_400_000 - 5_000);
    expect(delta).toBeLessThan(7 * 86_400_000 + 5_000);
  });

  it('member with pinDurationDays throws ForbiddenError', async () => {
    const member = await insertUser(db, { orgId, role: 'member' });
    await insertPost(db, { authorId: member.id, orgId, status: 'draft', body: 'no pin' });
    await expect(
      publishOwnDraft(db, {
        userId: member.id,
        orgId,
        callerRole: 'member',
        pinDurationDays: 7,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('moderator without pinDurationDays publishes unpinned', async () => {
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    await insertPost(db, { authorId: mod.id, orgId, status: 'draft', body: 'plain publish' });
    const dto = await publishOwnDraft(db, {
      userId: mod.id,
      orgId,
      callerRole: 'moderator',
    });
    expect(dto.pinned_at).toBeNull();
  });
});
