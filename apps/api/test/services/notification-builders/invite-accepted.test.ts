import type { Database } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../../src/db/index.js';
import { inviteAcceptedBuilder } from '../../../src/services/notification-builders/invite-accepted.js';
import { insertOrg, insertUser } from '../../helpers/seed.js';

async function displayNameOf(db: Kysely<Database>, userId: string): Promise<string> {
  const row = await db
    .selectFrom('users')
    .select('display_name')
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  return row.display_name;
}

describe('inviteAcceptedBuilder', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'hopechurch-nb-invite-accepted' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('writes one notification to the invitor', async () => {
    const invitor = await insertUser(db, { orgId });
    const invitee = await insertUser(db, { orgId });
    const inviteeName = await displayNameOf(db, invitee.id);

    await db.transaction().execute(async (trx) => {
      await inviteAcceptedBuilder(
        {
          id: newId(),
          org_id: orgId,
          type: 'invite.accepted',
          post_id: null,
          actor_id: invitor.id,
          payload: {
            invitation_id: '019da000-0000-7000-8000-000000000000',
            invitee_id: invitee.id,
            invitee_display_name: inviteeName,
          },
        },
        trx,
      );
    });
    const rows = await db.selectFrom('notifications').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(invitor.id);
    expect(rows[0]!.type).toBe('invite.accepted');
    expect(rows[0]!.org_id).toBe(orgId);
  });

  it('is a no-op when actor_id is null', async () => {
    const invitee = await insertUser(db, { orgId });
    const inviteeName = await displayNameOf(db, invitee.id);

    await db.transaction().execute(async (trx) => {
      await inviteAcceptedBuilder(
        {
          id: newId(),
          org_id: orgId,
          type: 'invite.accepted',
          post_id: null,
          actor_id: null,
          payload: {
            invitation_id: '019da000-0000-7000-8000-000000000000',
            invitee_id: invitee.id,
            invitee_display_name: inviteeName,
          },
        },
        trx,
      );
    });
    const rows = await db.selectFrom('notifications').selectAll().execute();
    expect(rows).toHaveLength(0);
  });
});
