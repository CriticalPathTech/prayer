import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// When compiled, this file lives at packages/db/dist/migrate.js — migrations directory is ../migrations.
// In dev (tsx), it lives at packages/db/src/migrate.ts — migrations directory is also ../migrations.
const migrationsDir = path.resolve(__dirname, '..', 'migrations');

export interface MigrateOptions {
  direction: 'up' | 'down';
  databaseUrl: string;
  count?: number;
}

export async function migrate({ direction, databaseUrl, count }: MigrateOptions): Promise<void> {
  await runner({
    databaseUrl,
    dir: migrationsDir,
    migrationsTable: 'pgmigrations',
    direction,
    count: count ?? (direction === 'up' ? Infinity : 1),
    logger: {
      info: (msg) => console.log(msg),
      warn: (msg) => console.warn(msg),
      error: (msg) => console.error(msg),
      debug: () => {},
    },
  });
}
