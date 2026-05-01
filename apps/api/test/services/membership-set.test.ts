import { createDb, newId } from '@prayer/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fetchMemberSet } from '../../src/services/membership-set.js';
import { insertOrg, insertUser } from '../helpers/seed.js';

const db = createDb(process.env.DATABASE_URL!);

describe('fetchMemberSet', () => {
  let orgId: string;
  let memberId: string;
  let formerId: string;
  let strangerId: string;
  let otherOrg: string;

  beforeAll(async () => {
    orgId = await insertOrg(db, { slug: `mset-${newId().slice(0, 8)}` });
    const member = await insertUser(db, { email: 'in@mset.com', orgId });
    memberId = member.id;
    const former = await insertUser(db, { email: 'former@mset.com', orgId });
    formerId = former.id;
    // Remove former's user_orgs row to simulate "deleted from org"
    await db
      .deleteFrom('user_orgs')
      .where('user_id', '=', formerId)
      .where('org_id', '=', orgId)
      .execute();
    otherOrg = await insertOrg(db, { slug: `mset-other-${newId().slice(0, 8)}` });
    const stranger = await insertUser(db, { email: 'stranger@mset.com', orgId: otherOrg });
    strangerId = stranger.id;
  });

  afterAll(async () => {
    await db.deleteFrom('user_orgs').where('org_id', 'in', [orgId, otherOrg]).execute();
    await db.deleteFrom('users').where('id', 'in', [memberId, formerId, strangerId]).execute();
    await db.deleteFrom('orgs').where('id', 'in', [orgId, otherOrg]).execute();
  });

  it('returns an empty set when input userIds is empty', async () => {
    const set = await fetchMemberSet(db, orgId, []);
    expect(set.size).toBe(0);
  });

  it('returns user_ids that have a user_orgs row in this org', async () => {
    const set = await fetchMemberSet(db, orgId, [memberId, formerId, strangerId]);
    expect(set.has(memberId)).toBe(true);
    expect(set.has(formerId)).toBe(false);
    expect(set.has(strangerId)).toBe(false);
  });

  it('only checks user_orgs for the given orgId, not globally', async () => {
    const set = await fetchMemberSet(db, orgId, [strangerId]);
    expect(set.has(strangerId)).toBe(false);
  });
});
