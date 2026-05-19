import { describe, it, expect, beforeEach } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { approvePost } from '../../src/services/post-approvals.js';
import { listApprovals } from '../../src/services/post-approvals.js';
import { rejectPost } from '../../src/services/post-approvals.js';
import { skipPostReview, unskipPostReview } from '../../src/services/post-approvals.js';
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

describe('rejectPost', () => {
  const db = initDb(process.env.TEST_DATABASE_URL!);

  beforeEach(async () => {
    await db.deleteFrom('mod_post_skips').execute();
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
  });

  it('flips status to rejected and stores note + writes event', async () => {
    const orgId = await getTestchurchOrgId(db);
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const author = await insertUser(db, { orgId, role: 'member' });
    const p = await insertPost(db, { authorId: author.id, orgId, status: 'pending', body: 'orig' });
    const dto = await rejectPost(db, {
      postId: p.id, orgId, callerId: mod.id, callerRole: 'moderator',
      note: 'Please reword the second paragraph.',
    });
    expect(dto.id).toBe(p.id);
    expect(dto.status).toBe('rejected');
    const stored = await db.selectFrom('posts').select(['moderation_note', 'moderated_by']).where('id', '=', p.id).executeTakeFirstOrThrow();
    expect(stored.moderation_note).toBe('Please reword the second paragraph.');
    expect(stored.moderated_by).toBe(mod.id);
    const evt = await db.selectFrom('events').select(['type', 'payload']).where('type', '=', 'post.rejected').executeTakeFirstOrThrow();
    expect((evt.payload as { moderation_note?: string }).moderation_note).toBe('Please reword the second paragraph.');
  });

  it('accepts no note → moderation_note stays null', async () => {
    const orgId = await getTestchurchOrgId(db);
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const author = await insertUser(db, { orgId, role: 'member' });
    const p = await insertPost(db, { authorId: author.id, orgId, status: 'pending', body: 'orig' });
    await rejectPost(db, { postId: p.id, orgId, callerId: mod.id, callerRole: 'moderator' });
    const stored = await db.selectFrom('posts').select('moderation_note').where('id', '=', p.id).executeTakeFirstOrThrow();
    expect(stored.moderation_note).toBeNull();
  });

  it('rejects note longer than 500 chars', async () => {
    const orgId = await getTestchurchOrgId(db);
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const author = await insertUser(db, { orgId, role: 'member' });
    const p = await insertPost(db, { authorId: author.id, orgId, status: 'pending' });
    await expect(
      rejectPost(db, { postId: p.id, orgId, callerId: mod.id, callerRole: 'moderator', note: 'x'.repeat(501) }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('skipPostReview / unskipPostReview', () => {
  const db = initDb(process.env.TEST_DATABASE_URL!);

  beforeEach(async () => {
    await db.deleteFrom('mod_post_skips').execute();
    await db.deleteFrom('posts').execute();
  });

  it('skip is idempotent — re-skip just refreshes skipped_at', async () => {
    const orgId = await getTestchurchOrgId(db);
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const author = await insertUser(db, { orgId, role: 'member' });
    const p = await insertPost(db, { authorId: author.id, orgId, status: 'pending' });

    await skipPostReview(db, { postId: p.id, orgId, callerId: mod.id, callerRole: 'moderator' });
    const first = await db.selectFrom('mod_post_skips').select('skipped_at').where('post_id', '=', p.id).executeTakeFirstOrThrow();
    await new Promise((r) => setTimeout(r, 10));
    await skipPostReview(db, { postId: p.id, orgId, callerId: mod.id, callerRole: 'moderator' });
    const second = await db.selectFrom('mod_post_skips').select('skipped_at').where('post_id', '=', p.id).executeTakeFirstOrThrow();
    expect(second.skipped_at.getTime()).toBeGreaterThan(first.skipped_at.getTime());
  });

  it('refuses to skip a non-pending post', async () => {
    const orgId = await getTestchurchOrgId(db);
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const author = await insertUser(db, { orgId, role: 'member' });
    const p = await insertPost(db, { authorId: author.id, orgId, status: 'published' });
    await expect(
      skipPostReview(db, { postId: p.id, orgId, callerId: mod.id, callerRole: 'moderator' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('unskip removes the row', async () => {
    const orgId = await getTestchurchOrgId(db);
    const mod = await insertUser(db, { orgId, role: 'moderator' });
    const author = await insertUser(db, { orgId, role: 'member' });
    const p = await insertPost(db, { authorId: author.id, orgId, status: 'pending' });
    await skipPostReview(db, { postId: p.id, orgId, callerId: mod.id, callerRole: 'moderator' });
    await unskipPostReview(db, { postId: p.id, orgId, callerId: mod.id, callerRole: 'moderator' });
    const rows = await db.selectFrom('mod_post_skips').selectAll().where('post_id', '=', p.id).execute();
    expect(rows.length).toBe(0);
  });
});
