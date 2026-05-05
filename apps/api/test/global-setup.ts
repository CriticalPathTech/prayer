import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate, newId } from '@prayer/db';
import dotenv from 'dotenv';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

export async function setup(): Promise<void> {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL is required');

  const pool = new Pool({ connectionString: testUrl });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.end();

  await migrate({ direction: 'up', databaseUrl: testUrl });

  // Seed a default org matching the createTestApp default Host (testchurch.prays.online).
  // orgContext resolves host → slug; tests that use app.agent without overriding Host
  // will hit this org. Tests that insert their own orgs (with distinct slugs) are
  // unaffected — their requests already use the testchurch host for orgContext, and the
  // existing requireAuth join (not yet org-scoped in M2) still finds users by supabase_auth_id.
  const pool2 = new Pool({ connectionString: testUrl });
  await pool2.query(
    `INSERT INTO orgs (id, slug, display_name)
     VALUES ($1, 'testchurch', 'Testchurch (test default)')
     ON CONFLICT (slug) DO NOTHING`,
    [newId()],
  );
  await pool2.end();

  const jwksPath = path.resolve(__dirname, 'fixtures/test-jwks.json');
  process.env.AUTH_JWKS_URL = `file://${jwksPath}`;
  process.env.DATABASE_URL = testUrl;
  process.env.S3_ENDPOINT = 'http://localhost:9000';
  process.env.S3_REGION = 'us-east-1';
  process.env.S3_BUCKET = 'avatars';
  process.env.S3_ACCESS_KEY = 'prayer-dev-local';
  process.env.S3_SECRET_KEY = 'prayer-dev-local-secret';
  process.env.S3_FORCE_PATH_STYLE = 'true';
  process.env.STORAGE_PUBLIC_URL_BASE = 'http://localhost:9000/avatars';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
}

export async function teardown(): Promise<void> {
  // Nothing — database content is reset per test via transactions.
}
