// image-reaper-job.ts sweeps orphaned post images.
//
// Uploads happen the instant a user picks a photo — before the image belongs
// to any post — which is what makes the compose UI feel instant. The cost of
// that choice is orphans: a user who picks three photos and closes the tab
// leaves three unreferenced rows and six S3 objects. This job is the
// mechanism that bounds them; it also bounds storage for clients that keep
// drafts in browser storage and never attach at all.
//
// Cross-org by design, same as the expiry sweeper: there is no caller
// principal, the cron runs as the system.

import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';
import cron, { type ScheduledTask } from 'node-cron';
import type { Logger } from 'pino';

import type { StorageClient } from '../lib/storage.js';

import { reapUnattachedImages } from './post-images.js';

const UNATTACHED_TTL_MS = 24 * 3600_000;

export interface ImageReaperDeps {
  db: Kysely<Database>;
  storage: StorageClient;
  logger: Logger;
  schedule?: string;
}

export interface ImageReaperHandle {
  start: () => void;
  stop: () => void;
  runOnce: () => Promise<number>;
}

export function createImageReaper(deps: ImageReaperDeps): ImageReaperHandle {
  // Hourly. The window is 24h, so finer precision buys nothing.
  const schedule = deps.schedule ?? '17 * * * *';
  let task: ScheduledTask | null = null;

  async function runOnce(): Promise<number> {
    const reaped = await reapUnattachedImages(deps.db, deps.storage, {
      olderThanMs: UNATTACHED_TTL_MS,
    });
    if (reaped > 0) deps.logger.info({ reaped }, 'image reaper sweep');
    return reaped;
  }

  return {
    start() {
      task = cron.schedule(schedule, async () => {
        try {
          await runOnce();
        } catch (err) {
          deps.logger.error({ err }, 'image reaper failed');
        }
      });
    },
    stop() {
      task?.stop();
      task = null;
    },
    runOnce,
  };
}
