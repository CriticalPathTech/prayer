import { createDb, newId } from '@prayer/db';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import {
  ForbiddenError,
  LastSuperUserError,
  NotFoundError,
  TooManySuperUsersError,
} from '../../src/middleware/error.js';
import {
  changeMemberRole,
  removeMember,
  updateChurchSettings,
} from '../../src/services/church-admin.js';
import { mintInviteCode } from '../../src/services/invite-codes.js';
import { getTestchurchOrgId, insertOrg, insertPost, insertUser } from '../helpers/seed.js';

const db = createDb(process.env.DATABASE_URL!);

describe('church-admin — removeMember', () => {
  let orgId: string;
  let actor: { id: string };
  let target: { id: string };

  beforeAll(async () => {
    orgId = await insertOrg(db, { slug: `chadm-${newId().slice(0, 8)}` });
  });

  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('invite_codes').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  afterAll(async () => {
    await db.deleteFrom('orgs').where('id', '=', orgId).execute();
  });

  it("removes the user_orgs row and zeroes the user's invite_codes seats", async () => {
    actor = await insertUser(db, { email: 'actor@chadm.com', orgId, role: 'super_user' });
    target = await insertUser(db, { email: 'target@chadm.com', orgId, role: 'member' });
    const code = await mintInviteCode(db, { ownerId: target.id, orgId, seatCap: 5 });

    await removeMember(db, { actorId: actor.id, targetUserId: target.id, orgId });

    const uo = await db
      .selectFrom('user_orgs')
      .where('user_id', '=', target.id)
      .where('org_id', '=', orgId)
      .selectAll()
      .executeTakeFirst();
    expect(uo).toBeUndefined();

    const codeRow = await db
      .selectFrom('invite_codes')
      .where('id', '=', code.id)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(codeRow.seats_remaining).toBe(0);
    expect(codeRow.is_active).toBe(true); // unchanged

    // users.id row must survive
    const userRow = await db
      .selectFrom('users')
      .where('id', '=', target.id)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(userRow.email).toBe('target@chadm.com');

    // event row written — scope by org_id + actor to avoid picking up events
    // from other test files that share this DB schema.
    const event = await db
      .selectFrom('events')
      .where('type', '=', 'admin.member_removed')
      .where('org_id', '=', orgId)
      .where('actor_id', '=', actor.id)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(event.payload).toMatchObject({ target_user_id: target.id });
  });

  it('throws ForbiddenError when actor === target (self-delete)', async () => {
    actor = await insertUser(db, { email: 'self@chadm.com', orgId, role: 'super_user' });
    await expect(
      removeMember(db, { actorId: actor.id, targetUserId: actor.id, orgId }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError when target is not a member of this org', async () => {
    actor = await insertUser(db, { email: 'actor2@chadm.com', orgId, role: 'super_user' });
    const otherOrg = await insertOrg(db, { slug: `chadm-other-${newId().slice(0, 8)}` });
    try {
      const stranger = await insertUser(db, { email: 'stranger@chadm.com', orgId: otherOrg });
      await expect(
        removeMember(db, { actorId: actor.id, targetUserId: stranger.id, orgId }),
      ).rejects.toBeInstanceOf(NotFoundError);
    } finally {
      await db.deleteFrom('user_orgs').where('org_id', '=', otherOrg).execute();
      await db.deleteFrom('orgs').where('id', '=', otherOrg).execute();
    }
  });
});

describe('church-admin — updateChurchSettings', () => {
  let orgId: string;
  let actor: { id: string };

  beforeAll(async () => {
    orgId = await insertOrg(db, {
      slug: `chset-${newId().slice(0, 8)}`,
      displayName: 'Original Name',
    });
    actor = await insertUser(db, { email: 'actor@chset.com', orgId, role: 'super_user' });
  });

  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db
      .updateTable('orgs')
      .set({ display_name: 'Original Name' })
      .where('id', '=', orgId)
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom('user_orgs').where('user_id', '=', actor.id).execute();
    await db.deleteFrom('users').where('id', '=', actor.id).execute();
    await db.deleteFrom('orgs').where('id', '=', orgId).execute();
  });

  it('updates the display_name and writes an event with before/after', async () => {
    const result = await updateChurchSettings(db, {
      orgId,
      actorId: actor.id,
      displayName: 'New Name',
    });
    expect(result.displayName).toBe('New Name');

    const row = await db
      .selectFrom('orgs')
      .where('id', '=', orgId)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.display_name).toBe('New Name');

    const event = await db
      .selectFrom('events')
      .where('type', '=', 'admin.org_settings_updated')
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(event.payload).toMatchObject({
      before: { display_name: 'Original Name' },
      after: { display_name: 'New Name' },
    });
  });

  it('trims whitespace and strips control + HTML-meaningful chars', async () => {
    const result = await updateChurchSettings(db, {
      orgId,
      actorId: actor.id,
      displayName: '  Hope <script> & Joy  ',
    });
    expect(result.displayName).toBe('Hope script  Joy');
  });

  it('rejects empty / whitespace-only displayName', async () => {
    await expect(
      updateChurchSettings(db, { orgId, actorId: actor.id, displayName: '   ' }),
    ).rejects.toThrow(/required/i);
  });

  it('rejects displayName longer than 60 chars after trim', async () => {
    await expect(
      updateChurchSettings(db, { orgId, actorId: actor.id, displayName: 'a'.repeat(61) }),
    ).rejects.toThrow(/60 characters/);
  });

  it('skips event write when value is unchanged', async () => {
    await updateChurchSettings(db, { orgId, actorId: actor.id, displayName: 'Original Name' });
    const eventCount = await db
      .selectFrom('events')
      .select(({ fn }) => fn.count<number>('id').as('count'))
      .where('type', '=', 'admin.org_settings_updated')
      .executeTakeFirstOrThrow();
    expect(Number(eventCount.count)).toBe(0);
  });
});

describe('updateChurchSettings — requires_post_approval', () => {
  const db = initDb(process.env.TEST_DATABASE_URL!);
  let orgId: string;

  beforeEach(async () => {
    orgId = await getTestchurchOrgId(db);
    // Reset flag + display_name so later tests in this suite start clean.
    await db
      .updateTable('orgs')
      .set({ requires_post_approval: false, display_name: 'Testchurch (test default)' })
      .where('id', '=', orgId)
      .execute();
  });

  afterEach(async () => {
    // Remove posts + users inserted by this suite (scoped to testchurch org).
    await db.deleteFrom('posts').where('org_id', '=', orgId).execute();
    await db.deleteFrom('events').where('org_id', '=', orgId).execute();
    await db.deleteFrom('user_orgs').where('org_id', '=', orgId).execute();
    await db
      .deleteFrom('users')
      .where('id', 'not in', db.selectFrom('user_orgs').select('user_id'))
      .execute();
    // Restore org state so subsequent test files see a clean testchurch.
    await db
      .updateTable('orgs')
      .set({ requires_post_approval: false, display_name: 'Testchurch (test default)' })
      .where('id', '=', orgId)
      .execute();
  });

  it('toggles false → true with no precondition', async () => {
    const actor = await insertUser(db, { orgId, role: 'super_user' });
    await updateChurchSettings(db, {
      orgId,
      actorId: actor.id,
      displayName: 'Test',
      requiresPostApproval: true,
    });
    const row = await db
      .selectFrom('orgs')
      .select('requires_post_approval')
      .where('id', '=', orgId)
      .executeTakeFirstOrThrow();
    expect(row.requires_post_approval).toBe(true);
  });

  it('toggles true → false with no pending posts', async () => {
    const actor = await insertUser(db, { orgId, role: 'super_user' });
    await db
      .updateTable('orgs')
      .set({ requires_post_approval: true })
      .where('id', '=', orgId)
      .execute();
    await updateChurchSettings(db, {
      orgId,
      actorId: actor.id,
      displayName: 'Test',
      requiresPostApproval: false,
    });
    const row = await db
      .selectFrom('orgs')
      .select('requires_post_approval')
      .where('id', '=', orgId)
      .executeTakeFirstOrThrow();
    expect(row.requires_post_approval).toBe(false);
  });

  it('refuses true → false with PendingPostsExistError when pending posts exist', async () => {
    const actor = await insertUser(db, { orgId, role: 'super_user' });
    const member = await insertUser(db, { orgId, role: 'member' });
    await db
      .updateTable('orgs')
      .set({ requires_post_approval: true })
      .where('id', '=', orgId)
      .execute();
    await insertPost(db, { authorId: member.id, orgId, status: 'pending' });
    await insertPost(db, { authorId: member.id, orgId, status: 'pending' });
    await expect(
      updateChurchSettings(db, {
        orgId,
        actorId: actor.id,
        displayName: 'Test',
        requiresPostApproval: false,
      }),
    ).rejects.toMatchObject({ name: 'PendingPostsExistError', count: 2 });
    const row = await db
      .selectFrom('orgs')
      .select('requires_post_approval')
      .where('id', '=', orgId)
      .executeTakeFirstOrThrow();
    expect(row.requires_post_approval).toBe(true);
  });
});

describe('church-admin — changeMemberRole', () => {
  let orgId: string;
  let actor: { id: string };

  beforeAll(async () => {
    orgId = await insertOrg(db, { slug: `chrole-${newId().slice(0, 8)}` });
    actor = await insertUser(db, { email: 'role-actor@chrole.com', orgId, role: 'super_user' });
  });

  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db
      .deleteFrom('user_orgs')
      .where('org_id', '=', orgId)
      .where('user_id', '!=', actor.id)
      .execute();
    await db
      .deleteFrom('users')
      .where('id', 'not in', db.selectFrom('user_orgs').select('user_id'))
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom('user_orgs').where('user_id', '=', actor.id).execute();
    await db.deleteFrom('users').where('id', '=', actor.id).execute();
    await db.deleteFrom('orgs').where('id', '=', orgId).execute();
  });

  it('promotes member → moderator and writes the event', async () => {
    const target = await insertUser(db, { email: 'm@chrole.com', orgId, role: 'member' });

    await changeMemberRole(db, {
      actorId: actor.id,
      targetUserId: target.id,
      orgId,
      newRole: 'moderator',
    });

    const uo = await db
      .selectFrom('user_orgs')
      .where('user_id', '=', target.id)
      .where('org_id', '=', orgId)
      .select('role')
      .executeTakeFirstOrThrow();
    expect(uo.role).toBe('moderator');

    const event = await db
      .selectFrom('events')
      .where('type', '=', 'admin.role_changed')
      .where('org_id', '=', orgId)
      .where('actor_id', '=', actor.id)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(event.payload).toMatchObject({
      target_user_id: target.id,
      before_role: 'member',
      after_role: 'moderator',
    });
  });

  it('promotes moderator → super_user when count < 3', async () => {
    const target = await insertUser(db, { email: 'mod@chrole.com', orgId, role: 'moderator' });

    await changeMemberRole(db, {
      actorId: actor.id,
      targetUserId: target.id,
      orgId,
      newRole: 'super_user',
    });

    const uo = await db
      .selectFrom('user_orgs')
      .where('user_id', '=', target.id)
      .where('org_id', '=', orgId)
      .select('role')
      .executeTakeFirstOrThrow();
    expect(uo.role).toBe('super_user');
  });

  it('demotes super_user → moderator when count > 1', async () => {
    const target = await insertUser(db, { email: 'su@chrole.com', orgId, role: 'super_user' });

    await changeMemberRole(db, {
      actorId: actor.id,
      targetUserId: target.id,
      orgId,
      newRole: 'moderator',
    });

    const uo = await db
      .selectFrom('user_orgs')
      .where('user_id', '=', target.id)
      .where('org_id', '=', orgId)
      .select('role')
      .executeTakeFirstOrThrow();
    expect(uo.role).toBe('moderator');
  });

  it('no-op when newRole === current role: returns without writing event', async () => {
    const target = await insertUser(db, { email: 'noop@chrole.com', orgId, role: 'moderator' });

    await changeMemberRole(db, {
      actorId: actor.id,
      targetUserId: target.id,
      orgId,
      newRole: 'moderator',
    });

    const eventCount = await db
      .selectFrom('events')
      .select(({ fn }) => fn.count<number>('id').as('count'))
      .where('type', '=', 'admin.role_changed')
      .where('org_id', '=', orgId)
      .where('actor_id', '=', actor.id)
      .executeTakeFirstOrThrow();
    expect(Number(eventCount.count)).toBe(0);
  });

  it('throws ForbiddenError when actor === target (self-change)', async () => {
    await expect(
      changeMemberRole(db, {
        actorId: actor.id,
        targetUserId: actor.id,
        orgId,
        newRole: 'moderator',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws TooManySuperUsersError when promoting to super_user at the cap', async () => {
    // actor is already 1 super_user. Add 2 more to reach the cap of 3.
    const su2 = await insertUser(db, { email: 'su2@chrole.com', orgId, role: 'super_user' });
    const su3 = await insertUser(db, { email: 'su3@chrole.com', orgId, role: 'super_user' });
    const candidate = await insertUser(db, { email: 'cand@chrole.com', orgId, role: 'moderator' });

    await expect(
      changeMemberRole(db, {
        actorId: actor.id,
        targetUserId: candidate.id,
        orgId,
        newRole: 'super_user',
      }),
    ).rejects.toBeInstanceOf(TooManySuperUsersError);

    // Sanity: candidate is unchanged.
    const cand = await db
      .selectFrom('user_orgs')
      .where('user_id', '=', candidate.id)
      .where('org_id', '=', orgId)
      .select('role')
      .executeTakeFirstOrThrow();
    expect(cand.role).toBe('moderator');
    void su2;
    void su3;
  });

  it('throws LastSuperUserError when demoting the only super_user', async () => {
    // Use a separate local org so we can have an isolated single-su scenario
    // without disturbing the shared actor.
    const localOrg = await insertOrg(db, { slug: `chrole-floor-${newId().slice(0, 8)}` });
    try {
      const onlySu = await insertUser(db, {
        email: 'only-su@chrole-floor.com',
        orgId: localOrg,
        role: 'super_user',
      });
      const otherActor = await insertUser(db, {
        email: 'other@chrole-floor.com',
        orgId: localOrg,
        role: 'super_user',
      });

      // Demote otherActor first so count = 1, leaving only onlySu.
      await changeMemberRole(db, {
        actorId: onlySu.id,
        targetUserId: otherActor.id,
        orgId: localOrg,
        newRole: 'moderator',
      });

      // Now demote onlySu — using otherActor (now moderator) as the actor.
      // Service layer doesn't check actor's role; route layer does. The
      // service's check here is the floor.
      await expect(
        changeMemberRole(db, {
          actorId: otherActor.id,
          targetUserId: onlySu.id,
          orgId: localOrg,
          newRole: 'moderator',
        }),
      ).rejects.toBeInstanceOf(LastSuperUserError);

      // Sanity: onlySu is unchanged.
      const stillSu = await db
        .selectFrom('user_orgs')
        .where('user_id', '=', onlySu.id)
        .where('org_id', '=', localOrg)
        .select('role')
        .executeTakeFirstOrThrow();
      expect(stillSu.role).toBe('super_user');
    } finally {
      await db.deleteFrom('events').where('org_id', '=', localOrg).execute();
      await db.deleteFrom('user_orgs').where('org_id', '=', localOrg).execute();
      await db
        .deleteFrom('users')
        .where('email', 'in', ['only-su@chrole-floor.com', 'other@chrole-floor.com'])
        .execute();
      await db.deleteFrom('orgs').where('id', '=', localOrg).execute();
    }
  });
});
