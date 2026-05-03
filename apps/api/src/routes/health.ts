import type { Database } from '@prayer/db';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export interface HealthRouterOptions {
  db: Kysely<Database>;
  gitSha: string;
  startedAt: number;
}

export function healthRouter({ db, gitSha, startedAt }: HealthRouterOptions): Router {
  const router = Router();

  router.get('/healthz', async (_req, res) => {
    const uptimeS = Math.round((Date.now() - startedAt) / 1000);
    try {
      await Promise.race([
        sql`SELECT 1`.execute(db),
        new Promise((_, reject) => setTimeout(() => reject(new Error('db timeout')), 2000)),
      ]);
      res.status(200).json({ status: 'ok', db: 'up', version: gitSha, uptime_s: uptimeS });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down', version: gitSha, uptime_s: uptimeS });
    }
  });

  return router;
}
