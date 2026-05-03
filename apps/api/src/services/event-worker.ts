import type { Database } from '@prayer/db';
import type { Kysely, Transaction } from 'kysely';
import { sql } from 'kysely';
import { Client as PgClient } from 'pg';
import type { Logger } from 'pino';

import type { EventKind } from './events.js';

export interface EventRow {
  id: string;
  type: string;
  post_id: string | null;
  actor_id: string | null;
  payload: unknown;
}

export type EventHandler = (event: EventRow, trx: Transaction<Database>) => Promise<void>;

export interface EventWorkerDeps {
  connectionString: string;
  db: Kysely<Database>;
  logger: Logger;
  /** Backup poll cadence. Default 10 000 ms. Tests inject short values. */
  pollIntervalMs?: number;
  /** Minimum age (ms) of unprocessed rows before the backup poll picks them up.
   *  Default 30 000 ms. 0 in tests. */
  pollThresholdMs?: number;
  /** Extra handlers to register on top of the built-in count recomputers. */
  extraHandlers?: Partial<Record<EventKind, EventHandler>>;
}

export interface EventWorker {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /** Run one handleEventId pass for the given id. Exposed for deterministic tests. */
  runOnce: (id: string) => Promise<void>;
}

export function createEventWorker(deps: EventWorkerDeps): EventWorker {
  const pollIntervalMs = deps.pollIntervalMs ?? 10_000;
  let client: PgClient | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const noop: EventHandler = async () => {};

  const builtinHandlers: Partial<Record<EventKind, EventHandler>> = {
    'post.update_created': noop,
  };

  const handlers: Partial<Record<EventKind, EventHandler>> = {
    ...builtinHandlers,
    ...(deps.extraHandlers ?? {}),
  };

  async function handleEventId(id: string): Promise<void> {
    // M4 semantics: UPDATE + handler in one transaction. A handler throw rolls
    // back BOTH the processed_at bump and any side-effect rows the handler wrote.
    // The backup poll (on a separate transaction) will retry later.
    await deps.db.transaction().execute(async (trx) => {
      const row = await trx
        .updateTable('events')
        .set({ processed_at: new Date() })
        .where('id', '=', id)
        .where('processed_at', 'is', null)
        .returning(['id', 'type', 'post_id', 'actor_id', 'payload'])
        .executeTakeFirst();
      if (!row) return; // already processed — commit no-op
      const handler = handlers[row.type as EventKind];
      if (!handler) {
        deps.logger.warn({ event: row }, 'event-worker: unknown event type');
        return; // commit — unknown events shouldn't accumulate
      }
      await handler(row as EventRow, trx); // throws → whole trx rolls back
    });
  }

  async function runBackupPoll(): Promise<void> {
    const threshold = new Date(Date.now() - (deps.pollThresholdMs ?? 30_000));
    const rows = await deps.db
      .selectFrom('events')
      .select('id')
      .where('processed_at', 'is', null)
      .where(sql<boolean>`created_at < ${threshold}`)
      .orderBy('id', 'asc')
      .limit(100)
      .execute();
    for (const row of rows) {
      await handleEventId(row.id).catch((err) =>
        deps.logger.error({ err, id: row.id }, 'event-worker: handler failed inside poll'),
      );
    }
  }

  return {
    async start() {
      const pending = new PgClient({ connectionString: deps.connectionString });
      pending.on('notification', (msg) => {
        const id = msg.payload;
        if (!id) return;
        void handleEventId(id).catch((err) =>
          deps.logger.error({ err, id }, 'event-worker: NOTIFY handling failed'),
        );
      });
      pending.on('error', (err) => {
        deps.logger.error({ err }, 'event-worker: pg client error');
      });
      try {
        await pending.connect();
        await pending.query('LISTEN events');
      } catch (err) {
        await pending.end().catch(() => {});
        throw err;
      }
      client = pending;
      deps.logger.info({}, 'event-worker: listening');
      pollTimer = setInterval(() => {
        void runBackupPoll().catch((err) =>
          deps.logger.error({ err }, 'event-worker: backup poll failed'),
        );
      }, pollIntervalMs);
      void runBackupPoll().catch((err) =>
        deps.logger.error({ err }, 'event-worker: initial poll failed'),
      );
    },
    async stop() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (client) {
        try {
          await client.query('UNLISTEN events');
        } catch {
          // ignore
        }
        await client.end();
        client = null;
      }
    },
    async runOnce(id: string) {
      await handleEventId(id);
    },
  };
}
