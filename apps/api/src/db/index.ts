import { createDb } from '@prayer/db';
import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';

export function initDb(connectionString: string): Kysely<Database> {
  return createDb(connectionString);
}
