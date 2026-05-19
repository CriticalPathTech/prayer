import { describe, it, expect, beforeEach } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { approvePost } from '../../src/services/post-approvals.js';
import { listApprovals } from '../../src/services/post-approvals.js';
import { getTestchurchOrgId, insertPost, insertUser } from '../helpers/seed.js';

describe('listApprovals', () => {
  const db = initDb(process.env.TEST_DATABASE_URL!);

  beforeEach(async () => {
    await db.deleteFrom('mod_post_skips').execute();
    await db.deleteFrom('posts').execute();
  });

  it('returns pending posts FIFO with skipped_by_me last', async () => {
    const orgId = await getTestchurchOrgId(db);
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const member = await insertUser(db, { orgId, role: 'member' });

    const p1 = await insertPost(db, { authorId: member.id, orgId, status: 'pending', body: 'first' });
    await new Promise((r) => setTimeout(r, 5));
    const p2 = await insertPost(db, { authorId: member.id, orgId, status: 'pending', body: 'second' });
    await new Promise((r) => setTimeout(r, 5));
    const p3 = await insertPost(db, { authorId: member.id, orgId, status: 'pending', body: 'third' });

    // Mod skips p1 — should fall to the end of mod's queue.
    await db
      .insertInto('mod_post_skips')
      .values({ post_id: p1.id, moderator_id: mod.id, org_id: orgId })
      .execute();

    const result = await listApprovals(db, {
      orgId, callerId: mod.id, callerRole: 'moderator', limit: 20,
    });
    expect(result.items.map((i) => i.id)).toEqual([p2.id, p3.id, p1.id]);
    expect(result.items[2]!.skipped_by_me).toBe(true);
    expect(result.items[0]!.skipped_by_me).toBe(false);
  });

  it('does not surface another moderator\'s skip', async () => {
    const orgId = await getTestchurchOrgId(db);
    const modA = await insertUser(db, { orgId, role: 'moderator' });
    const modB = await insertUser(db, { orgId, role: 'moderator' });
    const member = await insertUser(db, { orgId, role: 'member' });

    const p1 = await insertPost(db, { authorId: member.id, orgId, status: 'pending', body: 'first' });
    await new Promise((r) => setTimeout(r, 5));
    const p2 = await insertPost(db, { authorId: member.id, orgId, status: 'pending', body: 'second' });

    // Mod A skips p1.
    await db
      .insertInto('mod_post_skips')
      .values({ post_id: p1.id, moderator_id: modA.id, org_id: orgId })
      .execute();

    // Mod B's queue still has p1 at the top (oldest first), p2 second.
    const result = await listApprovals(db, {
      orgId, callerId: modB.id, callerRole: 'moderator', limit: 20,
    });
    expect(result.items.map((i) => i.id)).toEqual([p1.id, p2.id]);
    expect(result.items[0]!.skipped_by_me).toBe(false);
  });
});

describe('approvePost', () => {
  const db = initDb(process.env.TEST_DATABASE_URL!);

  beforeEach(async () => {
    await db.deleteFrom('mod_post_skips').execute();
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
  });

  it('DELETE+INSERT: published row has new id and new created_at', async () => {
    const orgId = await getTestchurchOrgId(db);
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const author = await insertUser(db, { orgId, role: 'member' });
    const original = await insertPost(db, { authorId: author.id, orgId, status: 'pending', body: 'orig' });
    const before = await db.selectFrom('posts').select(['id', 'created_at']).where('id', '=', original.id).executeTakeFirstOrThrow();
    await new Promise((r) => setTimeout(r, 5));
    const result = await approvePost(db, {
      postId: original.id, orgId, callerId: mod.id, callerRole: 'moderator',
    });
    expect(result.id).not.toBe(before.id);
    expect(result.status).toBe('published');
    const evt = await db.selectFrom('events').select('type').where('type', '=', 'post.approved').execute();
    expect(evt.length).toBe(1);
  });

  it('refuses when caller is the author (403)', async () => {
    const orgId = await getTestchurchOrgId(db);
    const author = await insertUser(db, { orgId, role: 'moderator' });
    const p = await insertPost(db, { authorId: author.id, orgId, status: 'pending' });
    await expect(
      approvePost(db, { postId: p.id, orgId, callerId: author.id, callerRole: 'moderator' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses when post is not pending (404)', async () => {
    const orgId = await getTestchurchOrgId(db);
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const author = await insertUser(db, { orgId, role: 'member' });
    const p = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await expect(
      approvePost(db, { postId: p.id, orgId, callerId: mod.id, callerRole: 'moderator' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses when caller is a regular member (403)', async () => {
    const orgId = await getTestchurchOrgId(db);
    const member = await insertUser(db, { orgId, role: 'member' });
    const author = await insertUser(db, { orgId, role: 'member' });
    const p = await insertPost(db, { authorId: author.id, orgId, status: 'pending' });
    await expect(
      approvePost(db, { postId: p.id, orgId, callerId: member.id, callerRole: 'member' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
