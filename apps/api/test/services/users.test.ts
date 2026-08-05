import type { Database } from '@prayer/db';
import { createDb, newId } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ValidationError } from '../../src/middleware/error.js';
import { fetchUserById, fetchUserPosts, updateDisplayName } from '../../src/services/users.js';
import { insertOrg, insertPost, insertUser } from '../helpers/seed.js';
import { makeInMemoryStorage } from '../helpers/storage.js';

const storage = makeInMemoryStorage();

// Local helpers for tests that exercise enrichment (prayed/reactions);
// the shared seed module doesn't ship inserters for these tables.
async function insertPrayer(
  db: Kysely<Database>,
  args: { postId: string; userId: string; orgId: string },
): Promise<void> {
  await db
    .insertInto('prayers')
    .values({ id: newId(), post_id: args.postId, user_id: args.userId, org_id: args.orgId })
    .execute();
}

async function insertReaction(
  db: Kysely<Database>,
  args: { postId: string; authorId: string; orgId: string; emoji: string },
): Promise<void> {
  await db
    .insertInto('reactions')
    .values({
      id: newId(),
      org_id: args.orgId,
      target_type: 'post',
      target_id: args.postId,
      author_id: args.authorId,
      emoji: args.emoji,
    })
    .execute();
}

const db = createDb(process.env.DATABASE_URL!);

async function legacyInsertOrg(): Promise<string> {
  const id = newId();
  await db
    .insertInto('orgs')
    .values({ id, slug: `org-${id.replace(/-/g, '')}`, display_name: 'Test Org' })
    .execute();
  return id;
}

async function legacyInsertUser(name: string, orgId: string): Promise<string> {
  const id = newId();
  await db
    .insertInto('users')
    .values({
      id,
      supabase_auth_id: newId(),
      email: `${id}@example.com`,
      display_name: name,
    })
    .execute();
  await db.insertInto('user_orgs').values({ user_id: id, org_id: orgId, role: 'member' }).execute();
  return id;
}

afterEach(async () => {
  await db.deleteFrom('invitations').execute();
  await db.deleteFrom('invite_codes').execute();
  await db.deleteFrom('prayers').execute();
  await db.deleteFrom('reactions').execute();
  await db.deleteFrom('posts').execute();
  await db.deleteFrom('user_orgs').execute();
  await db.deleteFrom('users').execute();
  // Preserve the 'testchurch' fixture org seeded by global-setup (needed by orgContext
  // in concurrently-running route tests). Only clean up test-local orgs.
  await db.deleteFrom('orgs').where('slug', '!=', 'testchurch').execute();
});

describe('updateDisplayName', () => {
  it('updates the row and returns the new DTO', async () => {
    const orgId = await legacyInsertOrg();
    const id = await legacyInsertUser('Old', orgId);
    const out = await updateDisplayName(db, { userId: id, orgId, input: 'Ben K.' });
    expect(out.display_name).toBe('Ben K.');
    const row = await db
      .selectFrom('users')
      .select('display_name')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.display_name).toBe('Ben K.');
  });

  it('strips HTML-meaningful characters via sanitizeDisplayName', async () => {
    const orgId = await legacyInsertOrg();
    const id = await legacyInsertUser('Old', orgId);
    const out = await updateDisplayName(db, { userId: id, orgId, input: '<script>Ben</script>' });
    expect(out.display_name).toBe('scriptBenscript');
  });

  it('caps at 60 characters', async () => {
    const orgId = await legacyInsertOrg();
    const id = await legacyInsertUser('Old', orgId);
    const input = 'a'.repeat(120);
    const out = await updateDisplayName(db, { userId: id, orgId, input });
    expect(out.display_name).toHaveLength(60);
  });

  it('throws ValidationError when the sanitized result is empty', async () => {
    const orgId = await legacyInsertOrg();
    const id = await legacyInsertUser('Old', orgId);
    await expect(updateDisplayName(db, { userId: id, orgId, input: '<>' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('throws ValidationError when input is the empty string', async () => {
    const orgId = await legacyInsertOrg();
    const id = await legacyInsertUser('Old', orgId);
    await expect(updateDisplayName(db, { userId: id, orgId, input: '' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// fetchUserById / fetchUserPosts (Member Profile Page)
// ---------------------------------------------------------------------------

describe('services/users — profile page fetchers', () => {
  let profileDb: Kysely<Database>;
  let orgId: string;

  beforeAll(async () => {
    profileDb = createDb(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await profileDb.destroy();
  });

  // The top-level afterEach wipes orgs (except 'testchurch'), so recreate the
  // profile-test org before every test rather than once in beforeAll.
  beforeEach(async () => {
    orgId = await insertOrg(profileDb, { slug: `profile-${newId().slice(0, 8)}` });
  });

  describe('fetchUserById', () => {
    it('returns target user dto when caller is same org', async () => {
      const target = await insertUser(profileDb, { orgId, displayName: 'Alice' });
      const dto = await fetchUserById(profileDb, { userId: target.id, orgId });
      expect(dto).toEqual({
        id: target.id,
        display_name: 'Alice',
        avatar_url: null,
        role: 'member',
      });
    });

    it('returns null for cross-org user', async () => {
      const otherOrgId = await insertOrg(profileDb, { slug: `other-${newId().slice(0, 8)}` });
      const target = await insertUser(profileDb, { orgId: otherOrgId, displayName: 'Bob' });
      const dto = await fetchUserById(profileDb, { userId: target.id, orgId });
      expect(dto).toBeNull();
    });

    it('returns null for nonexistent user', async () => {
      const dto = await fetchUserById(profileDb, {
        userId: '00000000-0000-0000-0000-000000000000',
        orgId,
      });
      expect(dto).toBeNull();
    });
  });

  describe('fetchUserPosts', () => {
    it('returns target user published top-level posts newest first', async () => {
      const target = await insertUser(profileDb, { orgId });
      const p1 = await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
      });
      const p2 = await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
      });
      const res = await fetchUserPosts(profileDb, storage, {
        userId: target.id,
        callerRole: 'member',
        callerId: target.id,
        orgId,
        cursor: null,
        limit: 20,
      });
      expect(res.posts.map((p) => p.id)).toEqual([p2.id, p1.id]);
      expect(res.nextCursor).toBeNull();
      // snapshotId == head post id; useUserPosts (Task 4) feeds this back
      // into the shared feed snapshot tracker, same shape as useFeed.
      expect(res.snapshotId).toBe(p2.id);
    });

    it('returns the all-zeros sentinel snapshotId when the user has no visible posts', async () => {
      const target = await insertUser(profileDb, { orgId });
      const res = await fetchUserPosts(profileDb, storage, {
        userId: target.id,
        callerRole: 'member',
        callerId: target.id,
        orgId,
        cursor: null,
        limit: 20,
      });
      expect(res.posts).toHaveLength(0);
      expect(res.nextCursor).toBeNull();
      expect(res.snapshotId).toBe('00000000-0000-0000-0000-000000000000');
    });

    it('excludes drafts, archived, hidden, pending', async () => {
      const target = await insertUser(profileDb, { orgId });
      await insertPost(profileDb, { authorId: target.id, orgId, status: 'draft' });
      await insertPost(profileDb, { authorId: target.id, orgId, status: 'archived' });
      await insertPost(profileDb, { authorId: target.id, orgId, status: 'hidden' });
      await insertPost(profileDb, { authorId: target.id, orgId, status: 'pending' });
      await insertPost(profileDb, { authorId: target.id, orgId, status: 'published' });
      const res = await fetchUserPosts(profileDb, storage, {
        userId: target.id,
        callerRole: 'member',
        callerId: target.id,
        orgId,
        cursor: null,
        limit: 20,
      });
      expect(res.posts).toHaveLength(1);
    });

    it('excludes updates (parent_id not null)', async () => {
      const target = await insertUser(profileDb, { orgId });
      const parent = await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
      });
      await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
        parentId: parent.id,
      });
      const res = await fetchUserPosts(profileDb, storage, {
        userId: target.id,
        callerRole: 'member',
        callerId: target.id,
        orgId,
        cursor: null,
        limit: 20,
      });
      expect(res.posts).toHaveLength(1);
      expect(res.posts[0]!.id).toBe(parent.id);
    });

    it('anonymity: other member sees only non-anonymous posts', async () => {
      const target = await insertUser(profileDb, { orgId });
      const other = await insertUser(profileDb, { orgId });
      await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
        isAnonymous: true,
      });
      const visible = await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
      });
      const res = await fetchUserPosts(profileDb, storage, {
        userId: target.id,
        callerRole: 'member',
        callerId: other.id,
        orgId,
        cursor: null,
        limit: 20,
      });
      expect(res.posts.map((p) => p.id)).toEqual([visible.id]);
    });

    it('anonymity: self sees own anonymous posts (masked via toPostDto + is_own_post=true)', async () => {
      // Note: the plan originally asserted that self sees their own anonymous
      // posts unmasked, but toPostDto's anonymity rule is global —
      // `canSeeAuthor = !is_anonymous || caller.role === 'super_user'`. Self is
      // a regular member here, so display_name is masked to null. What
      // distinguishes "mine vs not mine" client-side is `is_own_post`, which
      // is computed BEFORE the mask using the real author_id.
      const target = await insertUser(profileDb, { orgId, displayName: 'Alice' });
      await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
        isAnonymous: true,
      });
      const res = await fetchUserPosts(profileDb, storage, {
        userId: target.id,
        callerRole: 'member',
        callerId: target.id,
        orgId,
        cursor: null,
        limit: 20,
      });
      expect(res.posts).toHaveLength(1);
      expect(res.posts[0]!.display_name).toBeNull();
      expect(res.posts[0]!.is_own_post).toBe(true);
      expect(res.posts[0]!.is_anonymous).toBe(true);
    });

    it('anonymity: super_user sees all and identity revealed (toPostDto pass-through)', async () => {
      // Per toPostDto: super_user is the ONE role that can see the author of
      // anonymous posts (canSeeAuthor = !is_anonymous || role === 'super_user').
      // The plan's original assertion had this inverted; this test matches
      // actual toPostDto semantics shared across feed/post-detail/profile.
      const target = await insertUser(profileDb, { orgId, displayName: 'Alice' });
      const su = await insertUser(profileDb, { orgId, role: 'super_user' });
      await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
        isAnonymous: true,
      });
      const res = await fetchUserPosts(profileDb, storage, {
        userId: target.id,
        callerRole: 'super_user',
        callerId: su.id,
        orgId,
        cursor: null,
        limit: 20,
      });
      expect(res.posts).toHaveLength(1);
      expect(res.posts[0]!.display_name).toBe('Alice');
      expect(res.posts[0]!.is_anonymous).toBe(true);
    });

    it('anonymity: moderator (non-super_user) does NOT see anonymous posts', async () => {
      const target = await insertUser(profileDb, { orgId });
      const mod = await insertUser(profileDb, { orgId, role: 'moderator' });
      await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
        isAnonymous: true,
      });
      const res = await fetchUserPosts(profileDb, storage, {
        userId: target.id,
        callerRole: 'moderator',
        callerId: mod.id,
        orgId,
        cursor: null,
        limit: 20,
      });
      expect(res.posts).toHaveLength(0);
    });

    it('cursor pagination round-trips', async () => {
      const target = await insertUser(profileDb, { orgId });
      const created: string[] = [];
      for (let i = 0; i < 3; i++) {
        const p = await insertPost(profileDb, {
          authorId: target.id,
          orgId,
          status: 'published',
        });
        created.push(p.id);
      }
      const page1 = await fetchUserPosts(profileDb, storage, {
        userId: target.id,
        callerRole: 'member',
        callerId: target.id,
        orgId,
        cursor: null,
        limit: 2,
      });
      expect(page1.posts).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();
      const page2 = await fetchUserPosts(profileDb, storage, {
        userId: target.id,
        callerRole: 'member',
        callerId: target.id,
        orgId,
        cursor: page1.nextCursor,
        limit: 2,
      });
      expect(page2.posts).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
      const ids = [...page1.posts, ...page2.posts].map((p) => p.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('prayed reflects whether the caller has prayed for the post', async () => {
      const target = await insertUser(profileDb, { orgId });
      const viewer = await insertUser(profileDb, { orgId });
      const prayedPost = await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
      });
      const unprayedPost = await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
      });
      await insertPrayer(profileDb, {
        postId: prayedPost.id,
        userId: viewer.id,
        orgId,
      });

      const res = await fetchUserPosts(profileDb, storage, {
        userId: target.id,
        callerRole: 'member',
        callerId: viewer.id,
        orgId,
        cursor: null,
        limit: 20,
      });
      const byId = Object.fromEntries(res.posts.map((p) => [p.id, p]));
      expect(byId[prayedPost.id]!.prayed).toBe(true);
      expect(byId[unprayedPost.id]!.prayed).toBe(false);
    });

    it('reactions returns a per-emoji map with count + mine for the caller', async () => {
      const target = await insertUser(profileDb, { orgId });
      const viewer = await insertUser(profileDb, { orgId });
      const other = await insertUser(profileDb, { orgId });
      const post = await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
      });
      // Viewer reacts 🙏; another user also reacts 🙏 (count → 2, mine → true).
      // Another user reacts ❤️ (count → 1, mine → false).
      await insertReaction(profileDb, {
        postId: post.id,
        authorId: viewer.id,
        orgId,
        emoji: '🙏',
      });
      await insertReaction(profileDb, {
        postId: post.id,
        authorId: other.id,
        orgId,
        emoji: '🙏',
      });
      await insertReaction(profileDb, {
        postId: post.id,
        authorId: other.id,
        orgId,
        emoji: '❤️',
      });

      const res = await fetchUserPosts(profileDb, storage, {
        userId: target.id,
        callerRole: 'member',
        callerId: viewer.id,
        orgId,
        cursor: null,
        limit: 20,
      });
      expect(res.posts).toHaveLength(1);
      const reactions = res.posts[0]!.reactions;
      expect(reactions['🙏']!.count).toBe(2);
      expect(reactions['🙏']!.mine).toBe(true);
      expect(reactions['❤️']!.count).toBe(1);
      expect(reactions['❤️']!.mine).toBe(false);
    });

    it('updates returns the parent post published children inline', async () => {
      const target = await insertUser(profileDb, { orgId });
      const parent = await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
      });
      const u1 = await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
        parentId: parent.id,
      });
      const u2 = await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'published',
        parentId: parent.id,
      });
      // A hidden child must NOT come through on the profile (published-only).
      await insertPost(profileDb, {
        authorId: target.id,
        orgId,
        status: 'hidden',
        parentId: parent.id,
      });

      const res = await fetchUserPosts(profileDb, storage, {
        userId: target.id,
        callerRole: 'member',
        callerId: target.id,
        orgId,
        cursor: null,
        limit: 20,
      });
      expect(res.posts).toHaveLength(1);
      const updates = res.posts[0]!.updates;
      expect(updates).toHaveLength(2);
      // Oldest → newest (id ASC); u1 was created before u2.
      expect(updates.map((u) => u.id)).toEqual([u1.id, u2.id]);
    });
  });
});
