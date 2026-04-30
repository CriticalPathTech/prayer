// expiry-job.ts is the cron sweeper that archives expired posts.
//
// Multi-tenant note: this job is intentionally cross-org. The sweep query
// (`UPDATE posts SET status='archived' WHERE status='published' AND expires_at < NOW()`)
// runs against ALL orgs in a single pass — there is no caller principal to scope to,
// the cron runs as the system. This is correct for the current per-post expiry
// policy. If we ever introduce per-org expiry policies (different default windows,
// suspended-org carve-outs, etc.), revisit by adding a per-org loop.

import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import cron, { type ScheduledTask } from 'node-cron';
import type { Logger } from 'pino';

export interface ExpiryJobDeps {
  db: Kysely<Database>;
  logger: Logger;
  schedule?: string;
}

export interface ExpiryJobHandle {
  start: () => void;
  stop: () => void;
  runOnce: () => Promise<number>;
}

export async function sweepExpired(
  db: Kysely<Database>,
  opts: { logger: Logger },
): Promise<number> {
  const expired = await db
    .selectFrom('posts')
    .select(['id', 'author_id'])
    .where('status', '=', 'published')
    .where('expires_at', '<', new Date())
    .execute();
  if (expired.length === 0) return 0;

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('posts')
      .set({ status: 'archived' })
      .where(
        'id',
        'in',
        expired.map((r) => r.id),
      )
      .execute();
  });
  opts.logger.info({ archived: expired.length }, 'expiry sweep');
  return expired.length;
}

export function createExpirySweeper(deps: ExpiryJobDeps): ExpiryJobHandle {
  const schedule = deps.schedule ?? '*/5 * * * *';
  let task: ScheduledTask | null = null;

  return {
    start() {
      task = cron.schedule(schedule, async () => {
        try {
          await sweepExpired(deps.db, { logger: deps.logger });
        } catch (err) {
          deps.logger.error({ err }, 'expiry sweep failed');
        }
      });
    },
    stop() {
      task?.stop();
      task = null;
    },
    async runOnce() {
      return sweepExpired(deps.db, { logger: deps.logger });
    },
  };
}
