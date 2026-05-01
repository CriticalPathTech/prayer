import { createDb, newId } from '@prayer/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ForbiddenError, NotFoundError } from '../../src/middleware/error.js';
import { removeMember, updateChurchSettings } from '../../src/services/church-admin.js';
import { mintInviteCode } from '../../src/services/invite-codes.js';
import { insertOrg, insertUser } from '../helpers/seed.js';

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

    // event row written
    const event = await db
      .selectFrom('events')
      .where('type', '=', 'admin.member_removed')
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(event.actor_id).toBe(actor.id);
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
