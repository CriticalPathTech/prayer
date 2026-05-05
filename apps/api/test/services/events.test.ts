import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import {
  writePostEvent,
  writeReactionEvent,
  writePrayerEvent,
  writeFlagEvent,
  writeModerationEvent,
  writeInvitationEvent,
  writeAdminEvent,
} from '../../src/services/events.js';
import { insertOrg, insertPost, insertUser } from '../helpers/seed.js';

describe('writePostEvent', () => {
  let db: Kysely<Database>;
  let orgId: string;

  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'hopechurch-svc-events-post' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('inserts a post.update_created event with payload', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });

    await db.transaction().execute(async (trx) => {
      await writePostEvent(trx, {
        kind: 'post.update_created',
        orgId,
        postId: post.id,
        actorId: user.id,
        payload: { parent_id: post.id, is_answered_prayer: false },
      });
    });

    const rows = await db.selectFrom('events').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'post.update_created',
      post_id: post.id,
      actor_id: user.id,
      payload: { parent_id: post.id, is_answered_prayer: false },
      processed_at: null,
    });
  });
});

describe('writeReactionEvent', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'hopechurch-svc-events-reaction' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('writes a reaction.added event with target_type + emoji payload', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    await db.transaction().execute(async (trx) => {
      await writeReactionEvent(trx, {
        kind: 'reaction.added',
        orgId,
        postId: post.id,
        actorId: user.id,
        targetType: 'post',
        targetId: post.id,
        emoji: '🙏',
      });
    });
    const rows = await db.selectFrom('events').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'reaction.added',
      post_id: post.id,
      actor_id: user.id,
      payload: { target_type: 'post', target_id: post.id, emoji: '🙏' },
    });
  });
});

describe('writePrayerEvent', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'hopechurch-svc-events-prayer' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('writes a prayer.added event with post_id payload', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    await db.transaction().execute(async (trx) => {
      await writePrayerEvent(trx, {
        kind: 'prayer.added',
        orgId,
        postId: post.id,
        actorId: user.id,
      });
    });
    const rows = await db.selectFrom('events').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'prayer.added',
      post_id: post.id,
      actor_id: user.id,
      payload: { post_id: post.id },
    });
  });
});

describe('writeFlagEvent', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'hopechurch-svc-events-flag' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('writes a flag.created event with payload', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    await db.transaction().execute(async (trx) => {
      await writeFlagEvent(trx, {
        kind: 'flag.created',
        orgId,
        postId: post.id,
        actorId: user.id,
        flagId: '019da000-0000-7000-8000-000000000000',
        targetType: 'post',
        targetId: post.id,
        reason: 'off_topic',
      });
    });
    const rows = await db.selectFrom('events').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'flag.created',
      post_id: post.id,
      actor_id: user.id,
      payload: {
        target_type: 'post',
        target_id: post.id,
        reason: 'off_topic',
      },
    });
  });
});

describe('writeModerationEvent', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'hopechurch-svc-events-moderation' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('writes a moderator.hide event with source=auto and null actor', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    await db.transaction().execute(async (trx) => {
      await writeModerationEvent(trx, {
        kind: 'moderator.hide',
        orgId,
        postId: post.id,
        actorId: null,
        targetType: 'post',
        targetId: post.id,
        source: 'auto',
      });
    });
    const rows = await db.selectFrom('events').selectAll().execute();
    expect(rows[0]).toMatchObject({
      type: 'moderator.hide',
      actor_id: null,
      payload: { target_type: 'post', target_id: post.id, source: 'auto' },
    });
  });
});

describe('writeInvitationEvent', () => {
  let db: Kysely<Database>;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'hopechurch-svc-events-invitation' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('writes an invite.accepted event with null post_id and invitor as actor', async () => {
    const invitor = await insertUser(db, { orgId });
    const invitee = await insertUser(db, { orgId });
    await db.transaction().execute(async (trx) => {
      await writeInvitationEvent(trx, {
        kind: 'invite.accepted',
        orgId,
        actorId: invitor.id,
        invitationId: '019da000-0000-7000-8000-000000000000',
        inviteeId: invitee.id,
        inviteeDisplayName: 'member one',
      });
    });
    const rows = await db.selectFrom('events').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'invite.accepted',
      post_id: null,
      actor_id: invitor.id,
      payload: {
        invitation_id: '019da000-0000-7000-8000-000000000000',
        invitee_id: invitee.id,
        invitee_display_name: 'member one',
      },
    });
  });
});

describe('writeAdminEvent', () => {
  let db: Kysely<Database>;
  let orgId: string;

  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'hopechurch-svc-events-admin' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('events').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('writes an admin.member_removed row to events', async () => {
    const actor = await insertUser(db, { orgId });
    const targetId = (await insertUser(db, { orgId })).id;

    await writeAdminEvent(db, {
      kind: 'admin.member_removed',
      orgId,
      actorId: actor.id,
      targetUserId: targetId,
    });

    const row = await db
      .selectFrom('events')
      .selectAll()
      .where('type', '=', 'admin.member_removed')
      .executeTakeFirstOrThrow();
    expect(row.org_id).toBe(orgId);
    expect(row.actor_id).toBe(actor.id);
    expect(row.payload).toMatchObject({ target_user_id: targetId });
  });

  it('writes an admin.org_settings_updated row with before/after', async () => {
    const actor = await insertUser(db, { orgId });

    await writeAdminEvent(db, {
      kind: 'admin.org_settings_updated',
      orgId,
      actorId: actor.id,
      before: { displayName: 'Old Name' },
      after: { displayName: 'New Name' },
    });

    const row = await db
      .selectFrom('events')
      .selectAll()
      .where('type', '=', 'admin.org_settings_updated')
      .executeTakeFirstOrThrow();
    expect(row.payload).toMatchObject({
      before: { display_name: 'Old Name' },
      after: { display_name: 'New Name' },
    });
  });

  it('writes an admin.role_changed row with before/after roles', async () => {
    const actor = await insertUser(db, { orgId });
    const target = await insertUser(db, { orgId });

    await writeAdminEvent(db, {
      kind: 'admin.role_changed',
      orgId,
      actorId: actor.id,
      targetUserId: target.id,
      beforeRole: 'member',
      afterRole: 'moderator',
    });

    const row = await db
      .selectFrom('events')
      .selectAll()
      .where('type', '=', 'admin.role_changed')
      .executeTakeFirstOrThrow();
    expect(row.org_id).toBe(orgId);
    expect(row.actor_id).toBe(actor.id);
    expect(row.payload).toMatchObject({
      target_user_id: target.id,
      before_role: 'member',
      after_role: 'moderator',
    });
  });
});
