import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrate } from '../src/migrate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');

async function tableNames(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name);
}

describe('migrations', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    // Clean slate: drop everything in public schema.
    await pool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('applies all migrations up, then all down, then up again (round-trip)', async () => {
    await migrate({ direction: 'up', databaseUrl: TEST_DATABASE_URL });
    let tables = await tableNames(pool);
    expect(tables).toEqual(
      expect.arrayContaining([
        'comments',
        'events',
        'invitations',
        'notifications',
        'pgmigrations',
        'posts',
        'reactions',
        'users',
      ]),
    );

    await migrate({ direction: 'down', databaseUrl: TEST_DATABASE_URL, count: 100 });
    tables = await tableNames(pool);
    // Only pgmigrations survives a full down.
    expect(tables).toEqual(['pgmigrations']);

    await migrate({ direction: 'up', databaseUrl: TEST_DATABASE_URL });
    tables = await tableNames(pool);
    expect(tables).toEqual(expect.arrayContaining(['users', 'posts', 'comments', 'reactions']));
  });
});
