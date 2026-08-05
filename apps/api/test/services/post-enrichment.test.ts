import { type Database, newId } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { hideTarget } from '../../src/services/moderation.js';
import {
  fetchPrayedSet,
  fetchReactionsMap,
  fetchUpdatesByParent,
} from '../../src/services/post-enrichment.js';
import { getTestchurchOrgId, insertPost, insertUser } from '../helpers/seed.js';
import { makeInMemoryStorage } from '../helpers/storage.js';

describe('post-enrichment', () => {
  let db: Kysely<Database>;
  let orgId: string;
  let otherOrgId: string;
  const storage = makeInMemoryStorage();

  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await getTestchurchOrgId(db);
    otherOrgId = newId();
    await db
      .insertInto('orgs')
      .values({ id: otherOrgId, slug: `other-${otherOrgId.slice(0, 8)}`, display_name: 'Other' })
      .execute();
  });
  afterEach(async () => {
    await db.deleteFrom('prayers').execute();
    await db.deleteFrom('reactions').execute();
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
  });
  afterAll(async () => {
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
    await db.deleteFrom('orgs').where('id', '=', otherOrgId).execute();
    await db.destroy();
  });

  const ctx = (callerId: string, callerRole: 'member' | 'moderator' = 'member') => ({
    orgId,
    callerId,
    callerRole,
  });

  // An empty id list must never reach the query builder: `IN ()` is a Postgres
  // syntax error, so an empty page would 500 rather than render as empty.
  describe('empty input', () => {
    it('fetchPrayedSet returns an empty set without querying', async () => {
      const u = await insertUser(db, { orgId, role: 'member' });
      await expect(fetchPrayedSet(db, [], ctx(u.id))).resolves.toEqual(new Set());
    });

    it('fetchReactionsMap returns an empty map without querying', async () => {
      const u = await insertUser(db, { orgId, role: 'member' });
      await expect(fetchReactionsMap(db, [], ctx(u.id))).resolves.toEqual(new Map());
    });

    it('fetchUpdatesByParent returns an empty map without querying', async () => {
      const u = await insertUser(db, { orgId, role: 'member' });
      await expect(fetchUpdatesByParent(db, storage, [], ctx(u.id))).resolves.toEqual(new Map());
    });
  });

  describe('org scoping', () => {
    it('ignores a prayer recorded against another org', async () => {
      const u = await insertUser(db, { orgId, role: 'member' });
      const post = await insertPost(db, { authorId: u.id, orgId, status: 'published' });
      await db
        .insertInto('prayers')
        .values({ id: newId(), org_id: otherOrgId, post_id: post.id, user_id: u.id })
        .execute();

      await expect(fetchPrayedSet(db, [post.id], ctx(u.id))).resolves.toEqual(new Set());
    });

    it('ignores reactions recorded against another org', async () => {
      const u = await insertUser(db, { orgId, role: 'member' });
      const post = await insertPost(db, { authorId: u.id, orgId, status: 'published' });
      await db
        .insertInto('reactions')
        .values({
          id: newId(),
          org_id: otherOrgId,
          target_type: 'post',
          target_id: post.id,
          author_id: u.id,
          emoji: '🙏',
        })
        .execute();

      const map = await fetchReactionsMap(db, [post.id], ctx(u.id));
      expect(map.get(post.id)).toBeUndefined();
    });

    it('ignores child updates belonging to another org', async () => {
      const u = await insertUser(db, { orgId, role: 'member' });
      const parent = await insertPost(db, { authorId: u.id, orgId, status: 'published' });
      await insertPost(db, {
        authorId: u.id,
        orgId: otherOrgId,
        status: 'published',
        parentId: parent.id,
      });

      const map = await fetchUpdatesByParent(db, storage, [parent.id], ctx(u.id));
      expect(map.get(parent.id)).toBeUndefined();
    });
  });

  describe('reaction counts', () => {
    it('counts every author but sets mine only for the caller', async () => {
      const caller = await insertUser(db, { orgId, role: 'member' });
      const other = await insertUser(db, { orgId, role: 'member' });
      const post = await insertPost(db, { authorId: other.id, orgId, status: 'published' });
      await db
        .insertInto('reactions')
        .values([
          {
            id: newId(),
            org_id: orgId,
            target_type: 'post',
            target_id: post.id,
            author_id: other.id,
            emoji: '🙏',
          },
          {
            id: newId(),
            org_id: orgId,
            target_type: 'post',
            target_id: post.id,
            author_id: caller.id,
            emoji: '❤️',
          },
        ])
        .execute();

      const map = await fetchReactionsMap(db, [post.id], ctx(caller.id));
      expect(map.get(post.id)).toEqual({
        '🙏': { count: 1, mine: false },
        '❤️': { count: 1, mine: true },
      });
    });

    it('ignores comment reactions that share an id space with posts', async () => {
      const caller = await insertUser(db, { orgId, role: 'member' });
      const post = await insertPost(db, { authorId: caller.id, orgId, status: 'published' });
      await db
        .insertInto('reactions')
        .values({
          id: newId(),
          org_id: orgId,
          target_type: 'comment',
          target_id: post.id,
          author_id: caller.id,
          emoji: '🙏',
        })
        .execute();

      const map = await fetchReactionsMap(db, [post.id], ctx(caller.id));
      expect(map.get(post.id)).toBeUndefined();
    });
  });

  describe('hidden updates', () => {
    it('hides a hidden update from an ordinary member', async () => {
      const mod = await insertUser(db, { orgId, role: 'moderator' });
      const member = await insertUser(db, { orgId, role: 'member' });
      const parent = await insertPost(db, { authorId: member.id, orgId, status: 'published' });
      const visible = await insertPost(db, {
        authorId: member.id,
        orgId,
        status: 'published',
        parentId: parent.id,
      });
      const hidden = await insertPost(db, {
        authorId: member.id,
        orgId,
        status: 'published',
        parentId: parent.id,
      });
      await hideTarget(db, {
        callerId: mod.id,
        callerRole: 'moderator',
        orgId,
        targetType: 'post',
        targetId: hidden.id,
      });

      const map = await fetchUpdatesByParent(db, storage, [parent.id], ctx(member.id, 'member'));
      expect(map.get(parent.id)!.map((u) => u.id)).toEqual([visible.id]);
    });

    it('shows a hidden update to a moderator, with hide attribution', async () => {
      const mod = await insertUser(db, { orgId, role: 'moderator', displayName: 'Sam Mod' });
      const member = await insertUser(db, { orgId, role: 'member' });
      const parent = await insertPost(db, { authorId: member.id, orgId, status: 'published' });
      const hidden = await insertPost(db, {
        authorId: member.id,
        orgId,
        status: 'published',
        parentId: parent.id,
      });
      await hideTarget(db, {
        callerId: mod.id,
        callerRole: 'moderator',
        orgId,
        targetType: 'post',
        targetId: hidden.id,
      });

      const map = await fetchUpdatesByParent(db, storage, [parent.id], ctx(mod.id, 'moderator'));
      const update = map.get(parent.id)!.find((u) => u.id === hidden.id)!;
      expect(update.status).toBe('hidden');
      expect(update.hidden_by).toEqual({ id: mod.id, display_name: 'Sam Mod' });
      expect(update.hidden_source).toBe('manual');
    });
  });

  it('groups updates under the right parent, oldest first', async () => {
    const u = await insertUser(db, { orgId, role: 'member' });
    const p1 = await insertPost(db, { authorId: u.id, orgId, status: 'published' });
    const p2 = await insertPost(db, { authorId: u.id, orgId, status: 'published' });
    const a = await insertPost(db, {
      authorId: u.id,
      orgId,
      status: 'published',
      parentId: p1.id,
    });
    const b = await insertPost(db, {
      authorId: u.id,
      orgId,
      status: 'published',
      parentId: p2.id,
    });
    const c = await insertPost(db, {
      authorId: u.id,
      orgId,
      status: 'published',
      parentId: p1.id,
    });

    const map = await fetchUpdatesByParent(db, storage, [p1.id, p2.id], ctx(u.id));
    expect(map.get(p1.id)!.map((x) => x.id)).toEqual([a.id, c.id]);
    expect(map.get(p2.id)!.map((x) => x.id)).toEqual([b.id]);
  });
});
