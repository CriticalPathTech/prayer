import { describe, expect, it, vi } from 'vitest';

import { BOOTSTRAP_COMMENTS, BOOTSTRAP_POSTS } from '../src/bootstrap-data.js';
import {
  bootstrap,
  BOOTSTRAP_USERS,
  createOrReuseSupabaseUser,
  isFreshInstall,
  mintInviteCodeIfMissing,
  seedComments,
  seedPosts,
  upsertAppUser,
} from '../src/bootstrap.js';
import { createDb } from '../src/client.js';

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

describe('BOOTSTRAP_USERS', () => {
  it('has five users matching the spec defaults', () => {
    expect(BOOTSTRAP_USERS).toHaveLength(5);
    expect(BOOTSTRAP_USERS.map((u) => u.email)).toEqual([
      'superuser@prays.online',
      'mod1@prays.online',
      'mod2@prays.online',
      'mem1@prays.online',
      'mem2@prays.online',
    ]);
    expect(BOOTSTRAP_USERS.map((u) => u.role)).toEqual([
      'super_user',
      'moderator',
      'moderator',
      'member',
      'member',
    ]);
    BOOTSTRAP_USERS.forEach((u) => expect(u.password).toBe('prayer-dev-local'));
  });
});

describe('createOrReuseSupabaseUser', () => {
  it('creates a new auth user on first call', async () => {
    const state = { users: [] as Array<{ id: string; email: string }> };
    const supabase = fakeSupabase(state);
    const id = await createOrReuseSupabaseUser(supabase, {
      email: 'new@prays.online',
      password: 'prayer-dev-local',
    });
    expect(id).toBe(fakeAuthId(1));
    expect(state.users).toHaveLength(1);
  });

  it('returns the existing id when the email is already taken', async () => {
    const existingId = fakeAuthId(99);
    const state = {
      users: [{ id: existingId, email: 'taken@prays.online' }],
    };
    const supabase = fakeSupabase(state);
    const id = await createOrReuseSupabaseUser(supabase, {
      email: 'taken@prays.online',
      password: 'prayer-dev-local',
    });
    expect(id).toBe(existingId);
    expect(state.users).toHaveLength(1); // not duplicated
  });
});

describe('isFreshInstall', () => {
  it('returns true when users table is empty', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('users').execute();
      const fresh = await isFreshInstall(db);
      expect(fresh).toBe(true);
    } finally {
      await db.destroy();
    }
  });

  it('returns false when users table has rows', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('users').execute();
      await db
        .insertInto('users')
        .values({
          id: '01900000-0000-7000-8000-000000000001',
          supabase_auth_id: '00000000-0000-0000-0000-000000000001',
          email: 'existing@test.local',
          display_name: 'existing',
          role: 'member',
        })
        .execute();
      const fresh = await isFreshInstall(db);
      expect(fresh).toBe(false);
    } finally {
      await db.destroy();
    }
  });
});

describe('upsertAppUser', () => {
  it('inserts a row on first call, returns the same id on second', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.deleteFrom('users').execute();
      const supabaseId = '00000000-0000-0000-0000-000000000010';
      const userA = BOOTSTRAP_USERS[0]!;
      const id1 = await upsertAppUser(db, supabaseId, userA);
      const id2 = await upsertAppUser(db, supabaseId, userA);
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
      await db.deleteFrom('users').execute();
      const supabaseId = '00000000-0000-0000-0000-000000000020';
      const userId = await upsertAppUser(db, supabaseId, BOOTSTRAP_USERS[0]!);
      const created1 = await mintInviteCodeIfMissing(db, userId);
      const created2 = await mintInviteCodeIfMissing(db, userId);
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
      const created = await seedPosts(db, ['ignored'], false);
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
      await db.deleteFrom('users').execute();
      // Need 5 real user rows for the FK
      const userIds: string[] = [];
      for (const [i, u] of BOOTSTRAP_USERS.entries()) {
        const id = await upsertAppUser(db, `00000000-0000-0000-0000-00000000000${i + 1}`, u);
        userIds.push(id);
      }
      const created = await seedPosts(db, userIds, true);
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
      const created = await seedComments(db, ['ignored'], ['post1'], false);
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
      await db.deleteFrom('users').execute();
      const userIds: string[] = [];
      for (const [i, u] of BOOTSTRAP_USERS.entries()) {
        userIds.push(await upsertAppUser(db, `00000000-0000-0000-0000-00000000000${i + 1}`, u));
      }
      const postIds = await seedPosts(db, userIds, true);
      const created = await seedComments(db, userIds, postIds, true);
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
      await db.deleteFrom('users').execute();

      const state = { users: [] as Array<{ id: string; email: string }> };
      const supabase = fakeSupabase(state);
      const result = await bootstrap(
        { db, supabase },
        { name: 'Default Church', slug: 'default', skipSeed: false },
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
      await db.deleteFrom('users').execute();

      const state = { users: [] as Array<{ id: string; email: string }> };
      const supabase = fakeSupabase(state);
      await bootstrap(
        { db, supabase },
        { name: 'Default Church', slug: 'default', skipSeed: false },
      );
      const result = await bootstrap(
        { db, supabase },
        { name: 'Default Church', slug: 'default', skipSeed: false },
      );
      expect(result.usersCreated).toBe(0);
      expect(result.usersReused).toBe(5);
      expect(result.postsCreated).toBe(0);
      expect(result.commentsCreated).toBe(0);
    } finally {
      await db.destroy();
    }
  });
});
