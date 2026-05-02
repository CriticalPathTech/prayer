import { describe, expect, it, vi } from 'vitest';

import { BOOTSTRAP_COMMENTS, BOOTSTRAP_POSTS } from '../src/bootstrap-data.js';
import {
  bootstrap,
  bootstrapUsersForSlug,
  createOrReuseSupabaseUser,
  findOrCreateOrg,
  isFreshOrg,
  mintInviteCodeIfMissing,
  seedComments,
  seedPosts,
  upsertAppUser,
} from '../src/bootstrap.js';
import { createDb } from '../src/client.js';
import { newId } from '../src/ids.js';

function fakeAuthId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function fakeSupabase(state: { users: Array<{ id: string; email: string }> }) {
  return {
    auth: {
      admin: {
        createUser: vi.fn(async ({ email }: { email: string }) => {
          const existing = state.users.find((u) => u.email === email);
          if (existing) {
            return {
              data: { user: null },
              error: { status: 422, code: 'email_exists', message: 'exists' },
            };
          }
          const id = fakeAuthId(state.users.length + 1);
          state.users.push({ id, email });
          return { data: { user: { id, email } }, error: null };
        }),
        listUsers: vi.fn(async () => ({
          data: { users: state.users.map((u) => ({ id: u.id, email: u.email })) },
          error: null,
        })),
      },
    },
  } as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>;
}

describe('bootstrap', () => {
  it('module imports cleanly', () => {
    expect(typeof bootstrap).toBe('function');
  });
});

describe('bootstrapUsersForSlug', () => {
  it('returns 5 users with slug-prefixed emails and the spec roles', () => {
    const users = bootstrapUsersForSlug('demo', 'example.com');
    expect(users).toHaveLength(5);
    expect(users.map((u) => u.email)).toEqual([
      'demosu@example.com',
      'demomod1@example.com',
      'demomod2@example.com',
      'demomem1@example.com',
      'demomem2@example.com',
    ]);
    expect(users.map((u) => u.role)).toEqual([
      'super_user',
      'moderator',
      'moderator',
      'member',
      'member',
    ]);
    expect(users.map((u) => u.displayName)).toEqual([
      'Super User',
      'Moderator One',
      'Moderator Two',
      'Member One',
      'Member Two',
    ]);
  });

  it('different slug → different emails', () => {
    const a = bootstrapUsersForSlug('alpha', 'example.com');
    const b = bootstrapUsersForSlug('beta', 'example.com');
    expect(a[0]!.email).toBe('alphasu@example.com');
    expect(b[0]!.email).toBe('betasu@example.com');
  });

  it('different domain → different emails', () => {
    const a = bootstrapUsersForSlug('hope', 'example.com');
    const b = bootstrapUsersForSlug('hope', 'mychurch.org');
    expect(a[0]!.email).toBe('hopesu@example.com');
    expect(b[0]!.email).toBe('hopesu@mychurch.org');
  });
});

describe('createOrReuseSupabaseUser', () => {
  it('creates a new auth user on first call', async () => {
    const state = { users: [] as Array<{ id: string; email: string }> };
    const supabase = fakeSupabase(state);
    const id = await createOrReuseSupabaseUser(supabase, {
      email: 'new@example.com',
      password: 'prayer-dev-local',
    });
    expect(id).toBe(fakeAuthId(1));
    expect(state.users).toHaveLength(1);
  });

  it('returns the existing id when the email is already taken', async () => {
    const existingId = fakeAuthId(99);
    const state = {
      users: [{ id: existingId, email: 'taken@example.com' }],
    };
    const supabase = fakeSupabase(state);
    const id = await createOrReuseSupabaseUser(supabase, {
      email: 'taken@example.com',
      password: 'prayer-dev-local',
    });
    expect(id).toBe(existingId);
    expect(state.users).toHaveLength(1); // not duplicated
  });
});

describe('isFreshOrg', () => {
  it('returns true when the org has no posts', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('comments').execute();
      await db.deleteFrom('posts').execute();
      await db.deleteFrom('user_orgs').execute();
      await db.deleteFrom('users').execute();
      await db.deleteFrom('orgs').execute();
      const orgId = newId();
      await db
        .insertInto('orgs')
        .values({ id: orgId, slug: 'fresh-org-empty', display_name: 'fresh-org-empty' })
        .execute();
      expect(await isFreshOrg(db, orgId)).toBe(true);
    } finally {
      await db.destroy();
    }
  });

  it('returns false when the org has at least one post', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('comments').execute();
      await db.deleteFrom('posts').execute();
      await db.deleteFrom('user_orgs').execute();
      await db.deleteFrom('users').execute();
      await db.deleteFrom('orgs').execute();
      const orgId = newId();
      await db
        .insertInto('orgs')
        .values({ id: orgId, slug: 'fresh-org-with-post', display_name: 'fresh-org-with-post' })
        .execute();
      const userId = newId();
      await db
        .insertInto('users')
        .values({
          id: userId,
          supabase_auth_id: newId(),
          email: 'author@test.local',
          display_name: 'author',
        })
        .execute();
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db
        .insertInto('posts')
        .values({
          id: newId(),
          org_id: orgId,
          parent_id: null,
          author_id: userId,
          body: 'a post exists',
          status: 'published',
          is_anonymous: false,
          expires_at: future,
          edit_deadline: future,
        })
        .execute();
      expect(await isFreshOrg(db, orgId)).toBe(false);
    } finally {
      // Clean up the posts we inserted so downstream tests can delete users
      // without tripping posts.author_id FK.
      await db.deleteFrom('posts').execute();
      await db.destroy();
    }
  });

  it('is independent across orgs — sibling org with posts does not flip another org to non-fresh', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('comments').execute();
      await db.deleteFrom('posts').execute();
      await db.deleteFrom('user_orgs').execute();
      await db.deleteFrom('users').execute();
      await db.deleteFrom('orgs').execute();

      const orgWithPosts = newId();
      const orgEmpty = newId();
      await db
        .insertInto('orgs')
        .values([
          { id: orgWithPosts, slug: 'sibling-with-posts', display_name: 'sibling-with-posts' },
          { id: orgEmpty, slug: 'sibling-empty', display_name: 'sibling-empty' },
        ])
        .execute();

      const userId = newId();
      await db
        .insertInto('users')
        .values({
          id: userId,
          supabase_auth_id: newId(),
          email: 'sibling-author@test.local',
          display_name: 'sibling-author',
        })
        .execute();
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db
        .insertInto('posts')
        .values({
          id: newId(),
          org_id: orgWithPosts,
          parent_id: null,
          author_id: userId,
          body: 'sibling has content',
          status: 'published',
          is_anonymous: false,
          expires_at: future,
          edit_deadline: future,
        })
        .execute();

      expect(await isFreshOrg(db, orgWithPosts)).toBe(false);
      expect(await isFreshOrg(db, orgEmpty)).toBe(true);
    } finally {
      await db.deleteFrom('posts').execute();
      await db.destroy();
    }
  });
});

describe('upsertAppUser', () => {
  it('inserts a row on first call, returns the same id on second', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('user_orgs').execute();
      await db.deleteFrom('users').execute();
      await db.deleteFrom('orgs').execute();
      const orgId = newId();
      await db
        .insertInto('orgs')
        .values({ id: orgId, slug: 'test', display_name: 'Test' })
        .execute();
      const supabaseId = '00000000-0000-0000-0000-000000000010';
      const userA = bootstrapUsersForSlug('fixture', 'example.com')[0]!;
      const id1 = await upsertAppUser(db, supabaseId, userA, orgId);
      const id2 = await upsertAppUser(db, supabaseId, userA, orgId);
      expect(id1).toBe(id2);
      const count = await db
        .selectFrom('users')
        .select(({ fn }) => fn.count<number>('id').as('count'))
        .executeTakeFirstOrThrow();
      expect(Number(count.count)).toBe(1);
    } finally {
      await db.destroy();
    }
  });
});

describe('content fixtures', () => {
  it('exports exactly 10 posts', () => {
    expect(BOOTSTRAP_POSTS).toHaveLength(10);
  });

  it('post fixtures cover varied statuses and authors', () => {
    const statuses = new Set(BOOTSTRAP_POSTS.map((p) => p.status));
    expect(statuses.size).toBeGreaterThanOrEqual(2);
    const authors = new Set(BOOTSTRAP_POSTS.map((p) => p.authorIndex));
    expect(authors.size).toBeGreaterThanOrEqual(3);
    const anonCount = BOOTSTRAP_POSTS.filter((p) => p.isAnonymous).length;
    expect(anonCount).toBeGreaterThanOrEqual(1);
  });

  it('exports at least 5 comments distributed across multiple posts', () => {
    expect(BOOTSTRAP_COMMENTS.length).toBeGreaterThanOrEqual(5);
    const targetPosts = new Set(BOOTSTRAP_COMMENTS.map((c) => c.postIndex));
    expect(targetPosts.size).toBeGreaterThanOrEqual(3);
  });
});

describe('mintInviteCodeIfMissing', () => {
  it('creates an invite code on first call, skips on second', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('invite_codes').execute();
      await db.deleteFrom('user_orgs').execute();
      await db.deleteFrom('users').execute();
      await db.deleteFrom('orgs').execute();
      const orgId = newId();
      await db
        .insertInto('orgs')
        .values({ id: orgId, slug: 'test-invite', display_name: 'Test Invite' })
        .execute();
      const supabaseId = '00000000-0000-0000-0000-000000000020';
      const userId = await upsertAppUser(
        db,
        supabaseId,
        bootstrapUsersForSlug('fixture', 'example.com')[0]!,
        orgId,
      );
      const created1 = await mintInviteCodeIfMissing(db, userId, orgId);
      const created2 = await mintInviteCodeIfMissing(db, userId, orgId);
      expect(created1).toBe(true);
      expect(created2).toBe(false);
      const count = await db
        .selectFrom('invite_codes')
        .select(({ fn }) => fn.count<number>('id').as('count'))
        .where('owner_id', '=', userId)
        .executeTakeFirstOrThrow();
      expect(Number(count.count)).toBe(1);
    } finally {
      await db.destroy();
    }
  });
});

describe('seedPosts', () => {
  it('returns 0 when fresh=false (skip on non-fresh installs)', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('posts').execute();
      const orgId = newId();
      const created = await seedPosts(db, ['ignored'], orgId, false);
      expect(created).toEqual([]);
      const count = await db
        .selectFrom('posts')
        .select(({ fn }) => fn.count<number>('id').as('count'))
        .executeTakeFirstOrThrow();
      expect(Number(count.count)).toBe(0);
    } finally {
      await db.destroy();
    }
  });

  it('creates 10 posts when fresh=true', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('posts').execute();
      await db.deleteFrom('user_orgs').execute();
      await db.deleteFrom('users').execute();
      await db.deleteFrom('orgs').execute();
      const orgId = newId();
      await db
        .insertInto('orgs')
        .values({ id: orgId, slug: 'test-posts', display_name: 'Test Posts' })
        .execute();
      // Need 5 real user rows for the FK
      const userIds: string[] = [];
      for (const [i, u] of bootstrapUsersForSlug('fixture', 'example.com').entries()) {
        const id = await upsertAppUser(db, `00000000-0000-0000-0000-00000000000${i + 1}`, u, orgId);
        userIds.push(id);
      }
      const created = await seedPosts(db, userIds, orgId, true);
      expect(created).toHaveLength(10);
    } finally {
      await db.destroy();
    }
  });
});

describe('seedComments', () => {
  it('returns 0 when fresh=false', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('comments').execute();
      const orgId = newId();
      const created = await seedComments(db, ['ignored'], ['post1'], orgId, false);
      expect(created).toBe(0);
    } finally {
      await db.destroy();
    }
  });

  it('creates the configured comments when fresh=true', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('comments').execute();
      await db.deleteFrom('posts').execute();
      await db.deleteFrom('user_orgs').execute();
      await db.deleteFrom('users').execute();
      await db.deleteFrom('orgs').execute();
      const orgId = newId();
      await db
        .insertInto('orgs')
        .values({ id: orgId, slug: 'test-comments', display_name: 'Test Comments' })
        .execute();
      const userIds: string[] = [];
      for (const [i, u] of bootstrapUsersForSlug('fixture', 'example.com').entries()) {
        userIds.push(
          await upsertAppUser(db, `00000000-0000-0000-0000-00000000000${i + 1}`, u, orgId),
        );
      }
      const postIds = await seedPosts(db, userIds, orgId, true);
      const created = await seedComments(db, userIds, postIds, orgId, true);
      expect(created).toBe(BOOTSTRAP_COMMENTS.length);
    } finally {
      await db.destroy();
    }
  });
});

describe('bootstrap end-to-end', () => {
  it('fresh install: creates users + content', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      // Reset everything bootstrap touches
      await db.deleteFrom('comments').execute();
      await db.deleteFrom('posts').execute();
      await db.deleteFrom('invite_codes').execute();
      await db.deleteFrom('user_orgs').execute();
      await db.deleteFrom('users').execute();
      await db.deleteFrom('orgs').execute();

      await findOrCreateOrg(db, 'default', 'default');

      const state = { users: [] as Array<{ id: string; email: string }> };
      const supabase = fakeSupabase(state);
      const result = await bootstrap(
        { db, supabase },
        { slug: 'default', skipSeed: false, emailDomain: 'example.com' },
      );
      expect(result.usersCreated).toBe(5);
      expect(result.usersReused).toBe(0);
      expect(result.postsCreated).toBe(10);
      expect(result.commentsCreated).toBe(BOOTSTRAP_COMMENTS.length);
    } finally {
      await db.destroy();
    }
  });

  it('re-run is idempotent: no new users, no new posts', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('comments').execute();
      await db.deleteFrom('posts').execute();
      await db.deleteFrom('invite_codes').execute();
      await db.deleteFrom('user_orgs').execute();
      await db.deleteFrom('users').execute();
      await db.deleteFrom('orgs').execute();

      await findOrCreateOrg(db, 'default', 'default');

      const state = { users: [] as Array<{ id: string; email: string }> };
      const supabase = fakeSupabase(state);
      await bootstrap(
        { db, supabase },
        { slug: 'default', skipSeed: false, emailDomain: 'example.com' },
      );
      const result = await bootstrap(
        { db, supabase },
        { slug: 'default', skipSeed: false, emailDomain: 'example.com' },
      );
      expect(result.usersCreated).toBe(0);
      expect(result.usersReused).toBe(5);
      expect(result.postsCreated).toBe(0);
      expect(result.commentsCreated).toBe(0);
    } finally {
      await db.destroy();
    }
  });

  it('fails with a clear error if the org does not exist', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      // Don't pre-create the org
      await db.deleteFrom('comments').execute();
      await db.deleteFrom('posts').execute();
      await db.deleteFrom('invite_codes').execute();
      await db.deleteFrom('user_orgs').execute();
      await db.deleteFrom('users').execute();
      await db.deleteFrom('orgs').execute();

      const state = { users: [] as Array<{ id: string; email: string }> };
      const supabase = fakeSupabase(state);
      await expect(
        bootstrap(
          { db, supabase },
          { slug: 'never-created', skipSeed: true, emailDomain: 'example.com' },
        ),
      ).rejects.toThrow(/admin:create-org/);
    } finally {
      await db.destroy();
    }
  });

  it('seeds 5 users with slug-prefixed emails', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('comments').execute();
      await db.deleteFrom('posts').execute();
      await db.deleteFrom('invite_codes').execute();
      await db.deleteFrom('user_orgs').execute();
      await db.deleteFrom('users').execute();
      await db.deleteFrom('orgs').execute();

      await findOrCreateOrg(db, 'fixture-slug', 'fixture-slug');
      const state = { users: [] as Array<{ id: string; email: string }> };
      const supabase = fakeSupabase(state);
      await bootstrap(
        { db, supabase },
        { slug: 'fixture-slug', skipSeed: true, emailDomain: 'example.com' },
      );
      const emails = await db.selectFrom('users').select('email').orderBy('email').execute();
      expect(emails.map((r) => r.email)).toEqual([
        'fixture-slugmem1@example.com',
        'fixture-slugmem2@example.com',
        'fixture-slugmod1@example.com',
        'fixture-slugmod2@example.com',
        'fixture-slugsu@example.com',
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('generates random passwords for new users when BOOTSTRAP_ALLOW_REMOTE=1', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    process.env.BOOTSTRAP_ALLOW_REMOTE = '1';
    try {
      await db.deleteFrom('comments').execute();
      await db.deleteFrom('posts').execute();
      await db.deleteFrom('invite_codes').execute();
      await db.deleteFrom('user_orgs').execute();
      await db.deleteFrom('users').execute();
      await db.deleteFrom('orgs').execute();

      await findOrCreateOrg(db, 'pw-test-cloud', 'pw-test-cloud');
      const state = { users: [] as Array<{ id: string; email: string }> };
      const supabase = fakeSupabase(state);
      const result = await bootstrap(
        { db, supabase },
        { slug: 'pw-test-cloud', skipSeed: true, emailDomain: 'example.com' },
      );
      expect(result.credentials).toHaveLength(5);
      for (const cred of result.credentials) {
        expect(cred.email).toMatch(/^pw-test-cloud(su|mod[12]|mem[12])@example\.com$/);
        expect(cred.passwordOrNote).toMatch(/^[a-zA-Z0-9]{20}$/);
        expect(cred.passwordOrNote).not.toBe('prayer-dev-local');
      }
      const passwords = result.credentials.map((c) => c.passwordOrNote);
      expect(new Set(passwords).size).toBe(5);
    } finally {
      delete process.env.BOOTSTRAP_ALLOW_REMOTE;
      await db.destroy();
    }
  });

  it('uses prayer-dev-local for all users when BOOTSTRAP_ALLOW_REMOTE is unset', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    delete process.env.BOOTSTRAP_ALLOW_REMOTE;
    try {
      await db.deleteFrom('comments').execute();
      await db.deleteFrom('posts').execute();
      await db.deleteFrom('invite_codes').execute();
      await db.deleteFrom('user_orgs').execute();
      await db.deleteFrom('users').execute();
      await db.deleteFrom('orgs').execute();

      await findOrCreateOrg(db, 'pw-test-local', 'pw-test-local');
      const state = { users: [] as Array<{ id: string; email: string }> };
      const supabase = fakeSupabase(state);
      const result = await bootstrap(
        { db, supabase },
        { slug: 'pw-test-local', skipSeed: true, emailDomain: 'example.com' },
      );
      for (const cred of result.credentials) {
        expect(cred.passwordOrNote).toBe('prayer-dev-local');
      }
    } finally {
      await db.destroy();
    }
  });

  it('marks reused users as (reused) instead of leaking a fresh password', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('comments').execute();
      await db.deleteFrom('posts').execute();
      await db.deleteFrom('invite_codes').execute();
      await db.deleteFrom('user_orgs').execute();
      await db.deleteFrom('users').execute();
      await db.deleteFrom('orgs').execute();

      await findOrCreateOrg(db, 'pw-test-reuse', 'pw-test-reuse');
      const state = { users: [] as Array<{ id: string; email: string }> };
      const supabase = fakeSupabase(state);
      await bootstrap(
        { db, supabase },
        { slug: 'pw-test-reuse', skipSeed: true, emailDomain: 'example.com' },
      );
      const second = await bootstrap(
        { db, supabase },
        { slug: 'pw-test-reuse', skipSeed: true, emailDomain: 'example.com' },
      );
      expect(second.usersCreated).toBe(0);
      expect(second.usersReused).toBe(5);
      for (const cred of second.credentials) {
        expect(cred.passwordOrNote).toBe('(reused — password unchanged)');
      }
    } finally {
      await db.destroy();
    }
  });
});
