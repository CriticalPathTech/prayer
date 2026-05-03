import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { Pool } from 'pg';

import { migrate } from '../src/migrate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

// Runs once before any test file in packages/db. Drops + recreates the
// public schema and applies all migrations against TEST_DATABASE_URL so
// every test in this workspace can assume a clean, fully-migrated DB.
//
// Mirrors the pattern in apps/api/test/global-setup.ts.
export async function setup(): Promise<void> {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL is required');

  const pool = new Pool({ connectionString: testUrl });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.end();

  await migrate({ direction: 'up', databaseUrl: testUrl });
}

export async function teardown(): Promise<void> {
  // Tests clean up their own rows; nothing global to tear down.
}
