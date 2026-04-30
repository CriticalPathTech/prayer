/**
 * Unified cross-org isolation test suite.
 *
 * ONE shared beforeAll creates:
 *   orgA / orgB — two fully isolated orgs
 *   userA       — member of orgA
 *   userB       — member of orgB
 *   modA        — moderator of orgA
 *   postIdA/B   — one published post per org (seeded directly, no HTTP draft flow)
 *   commentIdA/B — one comment per org
 *   tokA/B/ModA — pre-minted JWTs reused across all describe blocks
 *
 * Per-block beforeAll is used only where a block needs fixtures that would
 * pollute the top-level setup (notifications, invite-codes, invitations).
 *
 * Consolidated from:
 *   cross-org-isolation-posts.test.ts       (Task 2.5)
 *   cross-org-isolation-feed.test.ts        (Task 2.7a)
 *   cross-org-isolation-comments.test.ts    (Task 2.7b)
 *   cross-org-isolation-reactions.test.ts   (Task 2.7c)
 *   cross-org-isolation-prayers.test.ts     (Task 2.7d)
 *   cross-org-isolation-flags.test.ts       (Task 2.7e)
 *   cross-org-isolation-moderation.test.ts  (Task 2.7f)
 *   cross-org-isolation-invitations.test.ts (Task 2.7g)
 *   cross-org-isolation-invite-codes.test.ts(Task 2.7h)
 *   cross-org-isolation-notifications.test.ts(Task 2.7i)
 */
import { newId } from '@prayer/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { clearSnapshotCache } from '../../src/services/feed-snapshot.js';
import { mintInviteCode } from '../../src/services/invite-codes.js';
import { mintTestJwt } from '../helpers/jwt.js';
import { insertComment, insertOrg, insertPost, insertUser } from '../helpers/seed.js';
import { createTestApp, type TestApp } from '../helpers/supertest.js';

// ---------------------------------------------------------------------------
// Shared fixture types
// ---------------------------------------------------------------------------

type TestUser = { id: string; supabaseAuthId: string; email: string };

// ---------------------------------------------------------------------------

describe('cross-org isolation', () => {
  let app: TestApp;
  let orgA: string;
  let orgB: string;
  let userA: TestUser;
  let userB: TestUser;
  let modA: TestUser;
  let postIdA: string;
  let postIdB: string;
  let _commentIdA: string;
  let commentIdB: string;
  let tokA: string;
  let tokB: string;
  let tokModA: string;

  beforeAll(async () => {
    app = await createTestApp();

    // orgA is the lakeside org seeded by global-setup — its slug matches the
    // default test Host (lakeside.prays.online), so userA's requests via the
    // default agent resolve correctly through orgContext + requireAuth.
    const lakeside = await app.db
      .selectFrom('orgs')
      .where('slug', '=', 'lakeside')
      .select('id')
      .executeTakeFirstOrThrow();
    orgA = lakeside.id;
    orgB = await insertOrg(app.db, { slug: 'cross-org-iso-b' });

    userA = await insertUser(app.db, { email: 'a@iso.com', orgId: orgA });
    userB = await insertUser(app.db, { email: 'b@iso.com', orgId: orgB });
    modA = await insertUser(app.db, { email: 'mod@iso.com', orgId: orgA, role: 'moderator' });

    const pA = await insertPost(app.db, {
      authorId: userA.id,
      orgId: orgA,
      body: 'orgA post',
      status: 'published',
    });
    postIdA = pA.id;

    const pB = await insertPost(app.db, {
      authorId: userB.id,
      orgId: orgB,
      body: 'orgB post',
      status: 'published',
    });
    postIdB = pB.id;

    const cA = await insertComment(app.db, {
      postId: postIdA,
      authorId: userA.id,
      orgId: orgA,
      body: 'orgA comment',
    });
    _commentIdA = cA.id;

    const cB = await insertComment(app.db, {
      postId: postIdB,
      authorId: userB.id,
      orgId: orgB,
      body: 'orgB comment',
    });
    commentIdB = cB.id;

    tokA = await mintTestJwt({ sub: userA.supabaseAuthId, email: userA.email });
    tokB = await mintTestJwt({ sub: userB.supabaseAuthId, email: userB.email });
    tokModA = await mintTestJwt({ sub: modA.supabaseAuthId, email: modA.email });

    // Clear snapshot cache so feed/snapshot tests read fresh per-org values.
    clearSnapshotCache();
  });

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // posts
  // -------------------------------------------------------------------------

  describe('posts', () => {
    it('GET /posts/:id — userA gets 404 on orgB post', async () => {
      const res = await request(app.app)
        .get(`/posts/${postIdB}`)
        .set('Authorization', `Bearer ${tokA}`);
      expect(res.status).toBe(404);
    });

    it('PATCH /posts/:id — userA cannot edit orgB post', async () => {
      const res = await request(app.app)
        .patch(`/posts/${postIdB}`)
        .set('Authorization', `Bearer ${tokA}`)
        .send({ body: 'pwn' });
      expect(res.status).toBe(404);
    });

    it('DELETE /posts/:id — userA cannot archive orgB post', async () => {
      const res = await request(app.app)
        .delete(`/posts/${postIdB}`)
        .set('Authorization', `Bearer ${tokA}`);
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // feed
  // -------------------------------------------------------------------------

  describe('feed', () => {
    it('GET /feed — userA only sees orgA posts', async () => {
      const res = await request(app.app)
        .get('/feed?filter=all')
        .set('Authorization', `Bearer ${tokA}`);
      expect(res.status).toBe(200);
      const ids = (res.body.posts ?? []).map((p: { id: string }) => p.id);
      expect(ids).toContain(postIdA);
      expect(ids).not.toContain(postIdB);
    });

    it('GET /feed — userB only sees orgB posts', async () => {
      // userB is a member of orgB only; default Host (lakeside) would 403.
      // Set Host explicitly so orgContext resolves to orgB.
      const res = await request(app.app)
        .get('/feed?filter=all')
        .set('Host', 'cross-org-iso-b.prays.online')
        .set('Authorization', `Bearer ${tokB}`);
      expect(res.status).toBe(200);
      const ids = (res.body.posts ?? []).map((p: { id: string }) => p.id);
      expect(ids).toContain(postIdB);
      expect(ids).not.toContain(postIdA);
    });

    it('GET /feed/snapshot — each org returns its own latest post id', async () => {
      const resA = await request(app.app)
        .get('/feed/snapshot')
        .set('Authorization', `Bearer ${tokA}`);
      const resB = await request(app.app)
        .get('/feed/snapshot')
        .set('Host', 'cross-org-iso-b.prays.online')
        .set('Authorization', `Bearer ${tokB}`);
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      // Each org's snapshot reflects only its own published posts.
      expect(resA.body.snapshotId).toBe(postIdA);
      expect(resB.body.snapshotId).toBe(postIdB);
    });
  });

  // -------------------------------------------------------------------------
  // comments
  // -------------------------------------------------------------------------

  describe('comments', () => {
    it('GET /posts/:id/comments — userA gets 404 on orgB post', async () => {
      const res = await request(app.app)
        .get(`/posts/${postIdB}/comments`)
        .set('Authorization', `Bearer ${tokA}`);
      expect(res.status).toBe(404);
    });

    it('POST /posts/:id/comments — userA cannot post comment on orgB post', async () => {
      const res = await request(app.app)
        .post(`/posts/${postIdB}/comments`)
        .set('Authorization', `Bearer ${tokA}`)
        .send({ body: 'sneaky' });
      expect(res.status).toBe(404);
    });

    it('PATCH /posts/:postId/comments/:id — userA cannot edit orgB comment', async () => {
      const res = await request(app.app)
        .patch(`/posts/${postIdB}/comments/${commentIdB}`)
        .set('Authorization', `Bearer ${tokA}`)
        .send({ body: 'pwn' });
      expect(res.status).toBe(404);
    });

    it('DELETE /posts/:postId/comments/:id — userA cannot delete orgB comment', async () => {
      const res = await request(app.app)
        .delete(`/posts/${postIdB}/comments/${commentIdB}`)
        .set('Authorization', `Bearer ${tokA}`);
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // reactions
  // -------------------------------------------------------------------------

  describe('reactions', () => {
    it('POST /posts/:id/reactions — userA cannot react on orgB post', async () => {
      const res = await request(app.app)
        .post(`/posts/${postIdB}/reactions`)
        .set('Authorization', `Bearer ${tokA}`)
        .send({ emoji: '🙏' });
      expect(res.status).toBe(404);
    });

    it('POST /posts/:id/reactions (second attempt same emoji) — still 404 for cross-org', async () => {
      const res = await request(app.app)
        .post(`/posts/${postIdB}/reactions`)
        .set('Authorization', `Bearer ${tokA}`)
        .send({ emoji: '❤️' });
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // prayers
  // -------------------------------------------------------------------------

  describe('prayers', () => {
    it('POST /posts/:id/pray — userA cannot mark prayed on orgB post', async () => {
      const res = await request(app.app)
        .post(`/posts/${postIdB}/pray`)
        .set('Authorization', `Bearer ${tokA}`)
        .send({});
      expect(res.status).toBe(404);
    });

    it('POST /posts/:id/pray (second attempt) — still 404 for cross-org toggle-off path', async () => {
      const res = await request(app.app)
        .post(`/posts/${postIdB}/pray`)
        .set('Authorization', `Bearer ${tokA}`)
        .send({});
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // flags
  // -------------------------------------------------------------------------

  describe('flags', () => {
    it('POST /posts/:id/flags — userA cannot flag orgB post', async () => {
      const res = await request(app.app)
        .post(`/posts/${postIdB}/flags`)
        .set('Authorization', `Bearer ${tokA}`)
        .send({ reason: 'inappropriate' });
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // moderation
  // -------------------------------------------------------------------------

  describe('moderation', () => {
    it('GET /mod/queue — modA sees only orgA flagged content', async () => {
      const res = await request(app.app)
        .get('/mod/queue')
        .set('Authorization', `Bearer ${tokModA}`);
      expect(res.status).toBe(200);
      // Even if orgB has flagged posts, none should appear in modA's queue.
      const items: Array<{ id?: string; target_id?: string }> = res.body.items ?? [];
      expect(items.find((i) => i.target_id === postIdB)).toBeUndefined();
    });

    it('POST /mod/posts/:id/hide — modA cannot hide orgB content', async () => {
      const res = await request(app.app)
        .post(`/mod/posts/${postIdB}/hide`)
        .set('Authorization', `Bearer ${tokModA}`)
        .send({});
      // org_id filter means the post is not found for orgA — returns hidden:true (idempotent)
      // but the post in orgB must NOT actually be hidden.
      if (res.status === 200) {
        // If the route returns 200 (idempotent no-op), verify the orgB post is NOT hidden.
        const row = await app.db
          .selectFrom('posts')
          .select('status')
          .where('id', '=', postIdB)
          .executeTakeFirst();
        expect(row?.status).not.toBe('hidden');
      } else {
        expect(res.status).toBe(404);
      }
    });

    it('POST /mod/posts/:id/unhide — modA cannot unhide orgB content', async () => {
      const res = await request(app.app)
        .post(`/mod/posts/${postIdB}/unhide`)
        .set('Authorization', `Bearer ${tokModA}`)
        .send({});
      // org_id filter means the post row is not found/modified for orgA — idempotent no-op or 404.
      if (res.status === 200) {
        const row = await app.db
          .selectFrom('posts')
          .select('status')
          .where('id', '=', postIdB)
          .executeTakeFirst();
        // Still published — unhide had no effect on orgB's post.
        expect(row?.status).toBe('published');
      } else {
        expect(res.status).toBe(404);
      }
    });
  });

  // -------------------------------------------------------------------------
  // invitations
  //
  // NOTE: /invitations/redeem uses requireSession (no pre-existing user_orgs).
  // The org context is derived from the invite code's org_id at redeem time.
  // Tests verify: redeeming an org-B code creates a user_orgs row in org B,
  // and that two orgs having codes doesn't bleed into each other.
  //
  // These tests manage their own user/code cleanup in a nested afterAll because
  // they create ad-hoc users outside the standard seed pattern.
  // -------------------------------------------------------------------------

  describe('invitations', () => {
    let invOrgA: string;
    let invOrgB: string;

    beforeAll(async () => {
      invOrgA = await insertOrg(app.db, { slug: `cross-inv-a-${newId().slice(0, 8)}` });
      invOrgB = await insertOrg(app.db, { slug: `cross-inv-b-${newId().slice(0, 8)}` });
    });

    afterAll(async () => {
      // Clean up all rows created by these tests so they don't bleed into other suites.
      await app.db.deleteFrom('invitations').execute();
      await app.db.deleteFrom('invite_codes').execute();
      await app.db.deleteFrom('events').execute();
      await app.db.deleteFrom('user_orgs').where('org_id', 'in', [invOrgA, invOrgB]).execute();
      await app.db.deleteFrom('users').where('email', 'like', '%@example.com').execute();
      await app.db.deleteFrom('orgs').where('id', 'in', [invOrgA, invOrgB]).execute();
    });

    it('redeeming an org-B invite code creates a user_orgs row in org B, not org A', async () => {
      // Create an owner user in org B (bare user without user_orgs — simulating bootstrap owner)
      const ownerBId = newId();
      await app.db
        .insertInto('users')
        .values({
          id: ownerBId,
          supabase_auth_id: newId(),
          email: `owner-b-${ownerBId}@example.com`,
          display_name: 'Owner B',
        })
        .execute();

      // Mint a code in org B
      const codeB = await mintInviteCode(app.db, { ownerId: ownerBId, orgId: invOrgB, seatCap: 3 });

      // A brand-new user redeems the org-B code
      const newUserSub = newId();
      const jwt = await mintTestJwt({
        sub: newUserSub,
        email: `newcomer-${newUserSub}@example.com`,
      });
      const res = await request(app.app)
        .post('/invitations/redeem')
        .set('Authorization', `Bearer ${jwt}`)
        .send({ code: codeB.code });

      expect(res.status).toBe(200);

      // Resolve the new user's id
      const newUser = await app.db
        .selectFrom('users')
        .select('id')
        .where('supabase_auth_id', '=', newUserSub)
        .executeTakeFirstOrThrow();

      // user_orgs row must be in org B only
      const orgBMembership = await app.db
        .selectFrom('user_orgs')
        .selectAll()
        .where('user_id', '=', newUser.id)
        .where('org_id', '=', invOrgB)
        .executeTakeFirst();
      expect(orgBMembership).toBeDefined();
      expect(orgBMembership!.role).toBe('member');

      // user_orgs row must NOT exist in org A
      const orgAMembership = await app.db
        .selectFrom('user_orgs')
        .selectAll()
        .where('user_id', '=', newUser.id)
        .where('org_id', '=', invOrgA)
        .executeTakeFirst();
      expect(orgAMembership).toBeUndefined();

      // The invitation ledger row must be scoped to org B
      const inv = await app.db
        .selectFrom('invitations')
        .selectAll()
        .where('invitee_id', '=', newUser.id)
        .executeTakeFirstOrThrow();
      expect(inv.org_id).toBe(invOrgB);

      // The new user's minted invite code must be scoped to org B
      const ownCode = await app.db
        .selectFrom('invite_codes')
        .selectAll()
        .where('owner_id', '=', newUser.id)
        .executeTakeFirstOrThrow();
      expect(ownCode.org_id).toBe(invOrgB);
    });

    it('two orgs can each have invite codes; redeeming one does not bleed into the other', async () => {
      // Owner A in org A, owner B in org B
      const ownerAId = newId();
      const ownerBId = newId();
      await app.db
        .insertInto('users')
        .values([
          {
            id: ownerAId,
            supabase_auth_id: newId(),
            email: `owner-a-${ownerAId}@example.com`,
            display_name: 'Owner A',
          },
          {
            id: ownerBId,
            supabase_auth_id: newId(),
            email: `owner-b-${ownerBId}@example.com`,
            display_name: 'Owner B',
          },
        ])
        .execute();

      const codeA = await mintInviteCode(app.db, {
        ownerId: ownerAId,
        orgId: invOrgA,
        seatCap: 3,
      });
      await mintInviteCode(app.db, { ownerId: ownerBId, orgId: invOrgB, seatCap: 3 });

      // Redeem org-A's code
      const subA = newId();
      const jwtA = await mintTestJwt({ sub: subA, email: `newcomer-a-${subA}@example.com` });
      const resA = await request(app.app)
        .post('/invitations/redeem')
        .set('Authorization', `Bearer ${jwtA}`)
        .send({ code: codeA.code });

      expect(resA.status).toBe(200);

      const newUserA = await app.db
        .selectFrom('users')
        .select('id')
        .where('supabase_auth_id', '=', subA)
        .executeTakeFirstOrThrow();

      // Must be in org A
      const memA = await app.db
        .selectFrom('user_orgs')
        .selectAll()
        .where('user_id', '=', newUserA.id)
        .where('org_id', '=', invOrgA)
        .executeTakeFirst();
      expect(memA).toBeDefined();

      // Must NOT be in org B
      const memB = await app.db
        .selectFrom('user_orgs')
        .selectAll()
        .where('user_id', '=', newUserA.id)
        .where('org_id', '=', invOrgB)
        .executeTakeFirst();
      expect(memB).toBeUndefined();

      // invitation must be org A
      const inv = await app.db
        .selectFrom('invitations')
        .selectAll()
        .where('invitee_id', '=', newUserA.id)
        .executeTakeFirstOrThrow();
      expect(inv.org_id).toBe(invOrgA);
    });
  });

  // -------------------------------------------------------------------------
  // invite-codes
  // -------------------------------------------------------------------------

  describe('invite-codes', () => {
    let icOrgA: string;
    let icOrgB: string;
    let icSlugA: string;
    let icSlugB: string;
    let icModA: TestUser;
    let icModB: TestUser;
    let icOwnerA: TestUser;
    let icOwnerB: TestUser;

    beforeAll(async () => {
      icSlugA = `cross-ic-a-${newId().slice(0, 8)}`;
      icSlugB = `cross-ic-b-${newId().slice(0, 8)}`;
      icOrgA = await insertOrg(app.db, { slug: icSlugA });
      icOrgB = await insertOrg(app.db, { slug: icSlugB });
      icModA = await insertUser(app.db, {
        email: 'mod-a@ic.com',
        orgId: icOrgA,
        role: 'moderator',
      });
      icModB = await insertUser(app.db, {
        email: 'mod-b@ic.com',
        orgId: icOrgB,
        role: 'moderator',
      });
      icOwnerA = await insertUser(app.db, { email: 'owner-a@ic.com', orgId: icOrgA });
      icOwnerB = await insertUser(app.db, { email: 'owner-b@ic.com', orgId: icOrgB });

      // Seed one invite code per org
      await mintInviteCode(app.db, { ownerId: icOwnerA.id, orgId: icOrgA, seatCap: 3 });
      await mintInviteCode(app.db, { ownerId: icOwnerB.id, orgId: icOrgB, seatCap: 3 });
    });

    afterAll(async () => {
      await app.db.deleteFrom('invite_codes').where('org_id', 'in', [icOrgA, icOrgB]).execute();
      await app.db.deleteFrom('user_orgs').where('org_id', 'in', [icOrgA, icOrgB]).execute();
      await app.db
        .deleteFrom('users')
        .where('id', 'in', [icModA.id, icModB.id, icOwnerA.id, icOwnerB.id])
        .execute();
      await app.db.deleteFrom('orgs').where('id', 'in', [icOrgA, icOrgB]).execute();
    });

    it('GET /me/invites — user sees only their own org codes', async () => {
      const tokOwnerA = await mintTestJwt({
        sub: icOwnerA.supabaseAuthId,
        email: icOwnerA.email,
      });
      const res = await request(app.app)
        .get('/me/invites')
        .set('Host', `${icSlugA}.prays.online`)
        .set('Authorization', `Bearer ${tokOwnerA}`);
      expect(res.status).toBe(200);
      const allCodes = [...(res.body.active ?? []), ...(res.body.retired ?? [])];
      const owners = allCodes.map((c: { owner_id?: string }) => c.owner_id);
      expect(owners).not.toContain(icOwnerB.id);
    });

    it('GET /mod/invite-codes — modA sees only orgA codes by owner_id', async () => {
      const tokIcModA = await mintTestJwt({ sub: icModA.supabaseAuthId, email: icModA.email });
      const res = await request(app.app)
        .get(`/mod/invite-codes?owner_id=${icOwnerA.id}`)
        .set('Host', `${icSlugA}.prays.online`)
        .set('Authorization', `Bearer ${tokIcModA}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // All returned codes belong to orgA's owner
      for (const code of res.body) {
        expect(code.owner_id ?? icOwnerA.id).toBe(icOwnerA.id);
      }
    });

    it('GET /mod/invite-codes — modA querying orgB owner returns empty (org isolation)', async () => {
      const tokIcModA = await mintTestJwt({ sub: icModA.supabaseAuthId, email: icModA.email });
      const res = await request(app.app)
        .get(`/mod/invite-codes?owner_id=${icOwnerB.id}`)
        .set('Host', `${icSlugA}.prays.online`)
        .set('Authorization', `Bearer ${tokIcModA}`);
      expect(res.status).toBe(200);
      // modA is in orgA; ownerB is in orgB — the org_id filter prevents cross-org leakage
      expect(res.body).toHaveLength(0);
    });

    it('POST /mod/invite-codes — code minted by modA is in orgA', async () => {
      const tokIcModA = await mintTestJwt({ sub: icModA.supabaseAuthId, email: icModA.email });
      const res = await request(app.app)
        .post('/mod/invite-codes')
        .set('Host', `${icSlugA}.prays.online`)
        .set('Authorization', `Bearer ${tokIcModA}`)
        .send({ owner_id: icOwnerA.id, seat_cap: 2 });
      expect(res.status).toBe(200);
      expect(res.body.code).toMatch(/^[a-z0-9]{5}$/);
      // Verify DB row is org-scoped
      const row = await app.db
        .selectFrom('invite_codes')
        .select('org_id')
        .where('id', '=', res.body.id)
        .executeTakeFirstOrThrow();
      expect(row.org_id).toBe(icOrgA);
    });

    it('POST /mod/invite-codes/:id/retire — modA cannot retire orgB code', async () => {
      // Mint a code in orgB directly
      const codeB = await mintInviteCode(app.db, {
        ownerId: icOwnerB.id,
        orgId: icOrgB,
        seatCap: 1,
      });
      const tokIcModA = await mintTestJwt({ sub: icModA.supabaseAuthId, email: icModA.email });
      const res = await request(app.app)
        .post(`/mod/invite-codes/${codeB.id}/retire`)
        .set('Host', `${icSlugA}.prays.online`)
        .set('Authorization', `Bearer ${tokIcModA}`);
      // The route returns 200 but the WHERE org_id clause means no rows are updated
      expect(res.status).toBe(200);
      // Confirm the orgB code is still active
      const row = await app.db
        .selectFrom('invite_codes')
        .select('is_active')
        .where('id', '=', codeB.id)
        .executeTakeFirstOrThrow();
      expect(row.is_active).toBe(true);
    });

    it('GET /mod/users/search — modA only sees users in orgA', async () => {
      const tokIcModA = await mintTestJwt({ sub: icModA.supabaseAuthId, email: icModA.email });
      const res = await request(app.app)
        .get('/mod/users/search?q=owner')
        .set('Host', `${icSlugA}.prays.online`)
        .set('Authorization', `Bearer ${tokIcModA}`);
      expect(res.status).toBe(200);
      const ids = res.body.map((u: { id: string }) => u.id);
      expect(ids).not.toContain(icOwnerB.id);
    });
  });

  // -------------------------------------------------------------------------
  // notifications
  // -------------------------------------------------------------------------

  describe('notifications', () => {
    let notifIdB: string;

    beforeAll(async () => {
      // Manually seed a notification for userB in orgB
      notifIdB = newId();
      await app.db
        .insertInto('notifications')
        .values({
          id: notifIdB,
          org_id: orgB,
          user_id: userB.id,
          type: 'comment.created',
          payload: { post_id: newId() } as never,
        })
        .execute();
    });

    it('GET /notifications — userA does not see userB orgB notification', async () => {
      const res = await request(app.app)
        .get('/notifications')
        .set('Authorization', `Bearer ${tokA}`);
      expect(res.status).toBe(200);
      const ids = (res.body.items ?? []).map((n: { id: string }) => n.id);
      expect(ids).not.toContain(notifIdB);
    });

    it('POST /notifications/:id/read — userA cannot mark orgB notification as read', async () => {
      const res = await request(app.app)
        .post(`/notifications/${notifIdB}/read`)
        .set('Authorization', `Bearer ${tokA}`);
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // hostname routing (M3)
  // orgContext middleware enforces the host→org mapping; this section verifies
  // the third defense-in-depth layer beyond service-layer scoping.
  // -------------------------------------------------------------------------

  describe('hostname routing', () => {
    it('userA JWT to orgB host → 403', async () => {
      // userA is a member of orgA only; targeting orgB's host means
      // requireAuth fails to find a user_orgs row for (userA, orgB).
      const res = await request(app.app)
        .get('/me')
        .set('Host', 'cross-org-iso-b.prays.online')
        .set('Authorization', `Bearer ${tokA}`);
      expect(res.status).toBe(403);
    });

    it('unknown subdomain → 404', async () => {
      const res = await request(app.app)
        .get('/me')
        .set('Host', 'nobody.prays.online')
        .set('Authorization', `Bearer ${tokA}`);
      expect(res.status).toBe(404);
    });

    it('non-prays.online host → 404', async () => {
      const res = await request(app.app)
        .get('/me')
        .set('Host', 'evil.example.com')
        .set('Authorization', `Bearer ${tokA}`);
      expect(res.status).toBe(404);
    });
  });
});
