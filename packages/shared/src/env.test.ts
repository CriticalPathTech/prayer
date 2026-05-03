import { describe, expect, it } from 'vitest';

import { loadApiEnv } from './env.js';

describe('RATE_LIMIT_ENABLED', () => {
  const base = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://u:p@localhost/db',
    AUTH_JWKS_URL: 'https://example.supabase.co/auth/v1/keys',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'avatars',
    S3_ACCESS_KEY: 'test-access-key',
    S3_SECRET_KEY: 'test-secret-key',
    S3_FORCE_PATH_STYLE: 'true',
    STORAGE_PUBLIC_URL_BASE: 'http://localhost:9000/avatars',
    CORS_ORIGIN: 'http://localhost:5173',
  };
  it('defaults to true when unset', () => {
    const env = loadApiEnv(base);
    expect(env.RATE_LIMIT_ENABLED).toBe(true);
  });
  it('parses "false" as false', () => {
    const env = loadApiEnv({ ...base, RATE_LIMIT_ENABLED: 'false' });
    expect(env.RATE_LIMIT_ENABLED).toBe(false);
  });
  it('parses "true" as true', () => {
    const env = loadApiEnv({ ...base, RATE_LIMIT_ENABLED: 'true' });
    expect(env.RATE_LIMIT_ENABLED).toBe(true);
  });
});
