import type { Database } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { NotFoundError } from '../../src/middleware/error.js';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../src/services/notifications.js';
import { insertUser } from '../helpers/seed.js';

async function insertNotification(
  db: Kysely<Database>,
  input: { userId: string; type?: string; readAt?: Date | null },
): Promise<{ id: string }> {
  const id = newId();
  await db
    .insertInto('notifications')
    .values({
      id,
      user_id: input.userId,
      type: input.type ?? 'comment.created',
      payload: { preview: 'hi' } as never,
      read_at: input.readAt ?? null,
    })
    .execute();
  return { id };
}

describe('listNotifications', () => {
  let db: Kysely<Database>;
  beforeAll(() => {
    db = initDb(process.env.TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('users').execute();
  });

  it("returns only the caller's notifications", async () => {
    const alice = await insertUser(db);
    const bob = await insertUser(db);
    await insertNotification(db, { userId: alice.id });
    await insertNotification(db, { userId: bob.id });

    const out = await listNotifications(db, { callerId: alice.id, limit: 20 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.user_id).toBe(alice.id);
  });

  it('unread filter + unread_count envelope', async () => {
    const u = await insertUser(db);
    await insertNotification(db, { userId: u.id, readAt: new Date() });
    await insertNotification(db, { userId: u.id, readAt: new Date() });
    await insertNotification(db, { userId: u.id, readAt: new Date() });
    await insertNotification(db, { userId: u.id });
    await insertNotification(db, { userId: u.id });

    const all = await listNotifications(db, { callerId: u.id, limit: 20 });
    expect(all.items).toHaveLength(5);
    expect(all.unread_count).toBe(2);

    const unread = await listNotifications(db, { callerId: u.id, limit: 20, unread: true });
    expect(unread.items).toHaveLength(2);
    expect(unread.unread_count).toBe(2);
  });

  it('cursor pagination is stable', async () => {
    const u = await insertUser(db);
    for (let i = 0; i < 25; i++) await insertNotification(db, { userId: u.id });

    const page1 = await listNotifications(db, { callerId: u.id, limit: 10 });
    expect(page1.items).toHaveLength(10);
    expect(page1.next_cursor).not.toBeNull();

    const page2 = await listNotifications(db, {
      callerId: u.id,
      limit: 10,
      cursor: page1.next_cursor!,
    });
    expect(page2.items).toHaveLength(10);

    const page3 = await listNotifications(db, {
      callerId: u.id,
      limit: 10,
      cursor: page2.next_cursor!,
    });
    expect(page3.items).toHaveLength(5);
    expect(page3.next_cursor).toBeNull();

    const all = [...page1.items, ...page2.items, ...page3.items].map((i) => i.id);
    expect(new Set(all).size).toBe(25);
  });
});

describe('markNotificationRead', () => {
  let db: Kysely<Database>;
  beforeAll(() => {
    db = initDb(process.env.TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('users').execute();
  });

  it("sets read_at on the caller's row", async () => {
    const u = await insertUser(db);
    const n = await insertNotification(db, { userId: u.id });
    const out = await markNotificationRead(db, { callerId: u.id, id: n.id });
    expect(out.read_at).not.toBeNull();
  });

  it('is idempotent — second call returns existing read_at', async () => {
    const u = await insertUser(db);
    const n = await insertNotification(db, { userId: u.id });
    const first = await markNotificationRead(db, { callerId: u.id, id: n.id });
    const second = await markNotificationRead(db, { callerId: u.id, id: n.id });
    expect(second.read_at).toBe(first.read_at);
  });

  it('throws NotFoundError when the row belongs to another user', async () => {
    const alice = await insertUser(db);
    const bob = await insertUser(db);
    const n = await insertNotification(db, { userId: alice.id });
    await expect(markNotificationRead(db, { callerId: bob.id, id: n.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('markAllNotificationsRead', () => {
  let db: Kysely<Database>;
  beforeAll(() => {
    db = initDb(process.env.TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('users').execute();
  });

  it('flips every unread row and reports the count', async () => {
    const u = await insertUser(db);
    await insertNotification(db, { userId: u.id });
    await insertNotification(db, { userId: u.id });
    await insertNotification(db, { userId: u.id, readAt: new Date() });
    const out = await markAllNotificationsRead(db, { callerId: u.id });
    expect(out.updated).toBe(2);
    const remaining = await db
      .selectFrom('notifications')
      .select((eb) => eb.fn.count<number>('id').as('c'))
      .where('user_id', '=', u.id)
      .where('read_at', 'is', null)
      .executeTakeFirstOrThrow();
    expect(Number(remaining.c)).toBe(0);
  });

  it('second call with nothing unread returns updated=0', async () => {
    const u = await insertUser(db);
    await insertNotification(db, { userId: u.id, readAt: new Date() });
    const out = await markAllNotificationsRead(db, { callerId: u.id });
    expect(out.updated).toBe(0);
  });
});
