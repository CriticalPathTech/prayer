// pin-job.ts: cron sweeper that auto-unpins posts whose pin_until has passed.
//
// Mirrors expiry-job.ts: cross-org by design (no caller principal — runs as
// system). No events written; matches the existing expiry-sweeper pattern.
// Snapshot is not bumped on auto-unpin (option B from the design spec):
// connected clients see the change on next manual fetch.

import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import cron, { type ScheduledTask } from 'node-cron';
import type { Logger } from 'pino';

export interface PinJobDeps {
  db: Kysely<Database>;
  logger: Logger;
  schedule?: string;
}

export interface PinJobHandle {
  start: () => void;
  stop: () => void;
  runOnce: () => Promise<number>;
}

export async function sweepPins(
  db: Kysely<Database>,
  opts: { logger: Logger },
): Promise<number> {
  const result = await db
    .updateTable('posts')
    .set({ pinned_at: null, pin_until: null, pinned_by: null })
    .where('pinned_at', 'is not', null)
    .where('pin_until', '<', new Date())
    .executeTakeFirst();
  const cleared = Number(result.numUpdatedRows);
  if (cleared > 0) opts.logger.info({ unpinned: cleared }, 'pin sweep');
  return cleared;
}

export function createPinSweeper(deps: PinJobDeps): PinJobHandle {
  const schedule = deps.schedule ?? '*/5 * * * *';
  let task: ScheduledTask | null = null;

  return {
    start() {
      task = cron.schedule(schedule, async () => {
        try {
          await sweepPins(deps.db, { logger: deps.logger });
        } catch (err) {
          deps.logger.error({ err }, 'pin sweep failed');
        }
      });
    },
    stop() {
      task?.stop();
      task = null;
    },
    async runOnce() {
      return sweepPins(deps.db, { logger: deps.logger });
    },
  };
}
