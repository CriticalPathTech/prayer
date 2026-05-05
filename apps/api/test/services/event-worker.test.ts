import type { Database } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely, Transaction } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { createLogger } from '../../src/lib/logger.js';
import {
  createEventWorker,
  type EventRow,
  type EventWorker,
} from '../../src/services/event-worker.js';
import { insertComment, insertOrg, insertPost, insertUser } from '../helpers/seed.js';

async function flush(n = 5): Promise<void> {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
}

describe('event-worker: NOTIFY happy path', () => {
  let db: Kysely<Database>;
  let worker: EventWorker;
  let orgId: string;

  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'testchurch-ew-notify' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await worker.stop();
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('processes an event inserted after start; processed_at is set', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'draft' });

    worker = createEventWorker({
      connectionString: process.env.TEST_DATABASE_URL!,
      db,
      logger: createLogger('silent'),
      pollIntervalMs: 60_000, // disabled for this test
      pollThresholdMs: 0,
    });
    await worker.start();

    const eventId = newId();
    await db
      .insertInto('events')
      .values({
        id: eventId,
        org_id: orgId,
        type: 'post.update_created',
        post_id: post.id,
        actor_id: user.id,
        payload: { is_anonymous: false, status: 'draft' } as never,
      })
      .execute();

    await vi.waitFor(
      async () => {
        const row = await db
          .selectFrom('events')
          .select('processed_at')
          .where('id', '=', eventId)
          .executeTakeFirst();
        expect(row?.processed_at).not.toBeNull();
      },
      { timeout: 2000 },
    );
  });

  it('starts successfully when pre-existing processed events are in the table', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });

    // Seed an event directly; mark already-processed so backup poll doesn't touch it.
    const preId = newId();
    await db
      .insertInto('events')
      .values({
        id: preId,
        org_id: orgId,
        type: 'post.update_created',
        post_id: post.id,
        actor_id: user.id,
        payload: {} as never,
        processed_at: new Date(),
      })
      .execute();

    worker = createEventWorker({
      connectionString: process.env.TEST_DATABASE_URL!,
      db,
      logger: createLogger('silent'),
      pollIntervalMs: 60_000,
      pollThresholdMs: 0,
    });
    await worker.start();
    await flush();
    // No assertion on snapshot — worker simply starts without error.
  });
});

describe('event-worker: backup poll + idempotency', () => {
  let db: Kysely<Database>;
  let worker: EventWorker;
  let orgId: string;

  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'testchurch-ew-backup' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await worker.stop();
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('backup poll picks up unprocessed events inserted while stopped', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });

    // Insert an event directly (no NOTIFY fan-out because no listener is connected yet)
    const eventId = newId();
    await db
      .insertInto('events')
      .values({
        id: eventId,
        org_id: orgId,
        type: 'post.update_created',
        post_id: post.id,
        actor_id: user.id,
        payload: {} as never,
      })
      .execute();

    worker = createEventWorker({
      connectionString: process.env.TEST_DATABASE_URL!,
      db,
      logger: createLogger('silent'),
      pollIntervalMs: 20,
      pollThresholdMs: 0,
    });
    await worker.start();

    await vi.waitFor(
      async () => {
        const row = await db
          .selectFrom('events')
          .select('processed_at')
          .where('id', '=', eventId)
          .executeTakeFirst();
        expect(row?.processed_at).not.toBeNull();
      },
      { timeout: 2000 },
    );
  });

  it('duplicate delivery results in exactly one handler call', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    const eventId = newId();
    await db
      .insertInto('events')
      .values({
        id: eventId,
        org_id: orgId,
        type: 'post.update_created',
        post_id: post.id,
        actor_id: user.id,
        payload: {} as never,
      })
      .execute();

    let calls = 0;
    worker = createEventWorker({
      connectionString: process.env.TEST_DATABASE_URL!,
      db,
      logger: createLogger('silent'),
      pollIntervalMs: 60_000,
      pollThresholdMs: 0,
      extraHandlers: {
        'post.update_created': async () => {
          calls++;
        },
      },
    });
    await worker.start();

    // Simulate three concurrent deliveries (NOTIFY + poll + retry).
    await Promise.all([worker.runOnce(eventId), worker.runOnce(eventId), worker.runOnce(eventId)]);

    // Exactly one handler invocation despite three runOnce calls.
    expect(calls).toBe(1);
    const row = await db
      .selectFrom('events')
      .select('processed_at')
      .where('id', '=', eventId)
      .executeTakeFirst();
    expect(row?.processed_at).not.toBeNull();
  });
});

describe('event-worker: error handling + shutdown', () => {
  let db: Kysely<Database>;
  let worker: EventWorker;
  let orgId: string;

  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'testchurch-ew-errors' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await worker.stop().catch(() => {});
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('handler exception rolls back processed_at (M4 semantics)', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    const eventId = newId();
    await db
      .insertInto('events')
      .values({
        id: eventId,
        org_id: orgId,
        type: 'post.update_created',
        post_id: post.id,
        actor_id: user.id,
        payload: {} as never,
      })
      .execute();

    worker = createEventWorker({
      connectionString: process.env.TEST_DATABASE_URL!,
      db,
      logger: createLogger('silent'),
      pollIntervalMs: 60_000,
      pollThresholdMs: 0,
      extraHandlers: {
        'post.update_created': async () => {
          throw new Error('handler boom');
        },
      },
    });
    await worker.start();
    await worker.runOnce(eventId).catch(() => {});

    // M4: handler throw rolls back the transaction. Row stays unprocessed for retry.
    const row = await db
      .selectFrom('events')
      .select('processed_at')
      .where('id', '=', eventId)
      .executeTakeFirst();
    expect(row?.processed_at).toBeNull();
  });

  it('unknown event type logs a warning and marks processed', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    const eventId = newId();
    await db
      .insertInto('events')
      .values({
        id: eventId,
        org_id: orgId,
        type: 'unknown.kind',
        post_id: post.id,
        actor_id: user.id,
        payload: {} as never,
      })
      .execute();

    worker = createEventWorker({
      connectionString: process.env.TEST_DATABASE_URL!,
      db,
      logger: createLogger('silent'),
      pollIntervalMs: 60_000,
      pollThresholdMs: 0,
    });
    await worker.start();
    await worker.runOnce(eventId);

    const row = await db
      .selectFrom('events')
      .select('processed_at')
      .where('id', '=', eventId)
      .executeTakeFirst();
    expect(row?.processed_at).not.toBeNull();
  });

  it('stop() is idempotent and safe to call before start', async () => {
    worker = createEventWorker({
      connectionString: process.env.TEST_DATABASE_URL!,
      db,
      logger: createLogger('silent'),
      pollIntervalMs: 60_000,
      pollThresholdMs: 0,
    });
    await worker.stop(); // before start — should not throw
    await worker.start();
    await worker.stop();
    await worker.stop(); // second stop — should not throw
  });
});

describe('event-worker: transactional handler pattern', () => {
  let db: Kysely<Database>;
  let worker: EventWorker;
  let orgId: string;

  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'testchurch-ew-trx' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await worker.stop().catch(() => {});
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('events').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('handler that throws rolls back the processed_at update', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    const eventId = newId();
    await db
      .insertInto('events')
      .values({
        id: eventId,
        org_id: orgId,
        type: 'post.update_created',
        post_id: post.id,
        actor_id: user.id,
        payload: {} as never,
      })
      .execute();

    worker = createEventWorker({
      connectionString: process.env.TEST_DATABASE_URL!,
      db,
      logger: createLogger('silent'),
      pollIntervalMs: 60_000,
      pollThresholdMs: 0,
      extraHandlers: {
        'post.update_created': async () => {
          throw new Error('handler boom');
        },
      },
    });
    await worker.start();

    // M4 semantics: handler throw rolls back the UPDATE so processed_at STAYS null.
    await worker.runOnce(eventId).catch(() => {});

    const row = await db
      .selectFrom('events')
      .select('processed_at')
      .where('id', '=', eventId)
      .executeTakeFirst();
    expect(row?.processed_at).toBeNull();
  });

  it('handler receives a Kysely transaction that commits with processed_at', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    const eventId = newId();
    await db
      .insertInto('events')
      .values({
        id: eventId,
        org_id: orgId,
        type: 'post.update_created',
        post_id: post.id,
        actor_id: user.id,
        payload: {} as never,
      })
      .execute();

    let trxSeenByHandler: unknown = null;
    worker = createEventWorker({
      connectionString: process.env.TEST_DATABASE_URL!,
      db,
      logger: createLogger('silent'),
      pollIntervalMs: 60_000,
      pollThresholdMs: 0,
      extraHandlers: {
        'post.update_created': async (_ev, trx) => {
          trxSeenByHandler = trx;
          await trx
            .insertInto('notifications')
            .values({
              id: newId(),
              org_id: orgId,
              user_id: user.id,
              type: 'test.marker',
              payload: { event_id: eventId } as never,
            })
            .execute();
        },
      },
    });
    await worker.start();
    await worker.runOnce(eventId);

    expect(trxSeenByHandler).not.toBeNull();
    const evRow = await db
      .selectFrom('events')
      .select('processed_at')
      .where('id', '=', eventId)
      .executeTakeFirst();
    expect(evRow?.processed_at).not.toBeNull();
    const notifs = await db.selectFrom('notifications').selectAll().execute();
    expect(notifs).toHaveLength(1);
    expect(notifs[0]!.type).toBe('test.marker');
  });

  it('failing handler leaves the row for backup poll to retry', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    const eventId = newId();
    await db
      .insertInto('events')
      .values({
        id: eventId,
        org_id: orgId,
        type: 'post.update_created',
        post_id: post.id,
        actor_id: user.id,
        payload: {} as never,
      })
      .execute();

    let attempts = 0;
    worker = createEventWorker({
      connectionString: process.env.TEST_DATABASE_URL!,
      db,
      logger: createLogger('silent'),
      pollIntervalMs: 15,
      pollThresholdMs: 0,
      extraHandlers: {
        'post.update_created': async () => {
          attempts += 1;
          if (attempts === 1) throw new Error('transient');
          // second attempt succeeds silently
        },
      },
    });
    await worker.start();

    await vi.waitFor(
      async () => {
        const row = await db
          .selectFrom('events')
          .select('processed_at')
          .where('id', '=', eventId)
          .executeTakeFirst();
        expect(row?.processed_at).not.toBeNull();
      },
      { timeout: 2000 },
    );
    expect(attempts).toBeGreaterThanOrEqual(2);
  });
});

describe('event-worker: reaction count recomputer routing', () => {
  let db: Kysely<Database>;
  let worker: EventWorker;
  let orgId: string;
  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'testchurch-ew-reactions' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  afterEach(async () => {
    await worker.stop().catch(() => {});
    await db.deleteFrom('events').execute();
    await db.deleteFrom('reactions').execute();
    await db.deleteFrom('comments').execute();
    await db.deleteFrom('posts').execute();
    await db.deleteFrom('user_orgs').execute();
    await db.deleteFrom('users').execute();
  });

  it('reaction.added on post target triggers reactionCountRecomputer', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    let advancedId: string | null = null;
    const reactionHandler = async (event: EventRow, trx: Transaction<Database>) => {
      const { reactionCountRecomputer } = await import('../../src/services/reaction-consumer.js');
      await reactionCountRecomputer(event, trx);
      const p = event.payload as { target_type: 'post' | 'comment' };
      if (p.target_type === 'post') advancedId = event.id;
    };
    worker = createEventWorker({
      connectionString: process.env.TEST_DATABASE_URL!,
      db,
      logger: createLogger('silent'),
      pollIntervalMs: 60_000,
      pollThresholdMs: 0,
      extraHandlers: { 'reaction.added': reactionHandler },
    });
    await worker.start();

    const eventId = newId();
    await db
      .insertInto('events')
      .values({
        id: eventId,
        org_id: orgId,
        type: 'reaction.added',
        post_id: post.id,
        actor_id: user.id,
        payload: { target_type: 'post', target_id: post.id, emoji: '🙏' } as never,
      })
      .execute();
    await worker.runOnce(eventId);
    expect(advancedId).toBe(eventId);
  });

  it('reaction.added on comment target does NOT trigger post-scoped handler', async () => {
    const user = await insertUser(db, { orgId });
    const post = await insertPost(db, { authorId: user.id, orgId, status: 'published' });
    const comment = await insertComment(db, { postId: post.id, authorId: user.id, orgId });
    let advancedId: string | null = null;
    const reactionHandler = async (event: EventRow, trx: Transaction<Database>) => {
      const { reactionCountRecomputer } = await import('../../src/services/reaction-consumer.js');
      await reactionCountRecomputer(event, trx);
      const p = event.payload as { target_type: 'post' | 'comment' };
      if (p.target_type === 'post') advancedId = event.id;
    };
    worker = createEventWorker({
      connectionString: process.env.TEST_DATABASE_URL!,
      db,
      logger: createLogger('silent'),
      pollIntervalMs: 60_000,
      pollThresholdMs: 0,
      extraHandlers: { 'reaction.added': reactionHandler },
    });
    await worker.start();

    const eventId = newId();
    await db
      .insertInto('events')
      .values({
        id: eventId,
        org_id: orgId,
        type: 'reaction.added',
        post_id: post.id,
        actor_id: user.id,
        payload: { target_type: 'comment', target_id: comment.id, emoji: '🙌' } as never,
      })
      .execute();
    await worker.runOnce(eventId);
    expect(advancedId).toBeNull();
  });
});
