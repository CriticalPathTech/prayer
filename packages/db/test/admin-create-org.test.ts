import { describe, expect, it } from 'vitest';

import { createOrgFromCli } from '../src/admin-create-org.js';
import { createDb } from '../src/client.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;

describe('admin:create-org — createOrgFromCli', () => {
  it('creates the org row when slug is new', async () => {
    const db = createDb(TEST_DATABASE_URL);
    try {
      const result = await createOrgFromCli(db, 'admin-create-test-1');
      expect(result.created).toBe(true);
      expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
      const row = await db
        .selectFrom('orgs')
        .where('slug', '=', 'admin-create-test-1')
        .select(['id', 'display_name'])
        .executeTakeFirstOrThrow();
      expect(row.id).toBe(result.id);
      expect(row.display_name).toBe('admin-create-test-1');
    } finally {
      await db.deleteFrom('orgs').where('slug', '=', 'admin-create-test-1').execute();
      await db.destroy();
    }
  });

  it('is idempotent — second call on the same slug returns created=false with the existing id', async () => {
    const db = createDb(TEST_DATABASE_URL);
    try {
      const first = await createOrgFromCli(db, 'admin-create-test-2');
      const second = await createOrgFromCli(db, 'admin-create-test-2');
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.id).toBe(first.id);
    } finally {
      await db.deleteFrom('orgs').where('slug', '=', 'admin-create-test-2').execute();
      await db.destroy();
    }
  });

  it('rejects DNS-invalid slugs', async () => {
    const db = createDb(TEST_DATABASE_URL);
    try {
      await expect(createOrgFromCli(db, '-bad')).rejects.toThrow(/valid DNS label/);
      await expect(createOrgFromCli(db, 'bad-')).rejects.toThrow(/valid DNS label/);
      await expect(createOrgFromCli(db, 'BAD')).rejects.toThrow(/valid DNS label/);
      await expect(createOrgFromCli(db, '')).rejects.toThrow(/valid DNS label/);
      await expect(createOrgFromCli(db, 'a'.repeat(64))).rejects.toThrow(/valid DNS label/);
    } finally {
      await db.destroy();
    }
  });

  it('accepts valid DNS-label slugs', async () => {
    const db = createDb(TEST_DATABASE_URL);
    try {
      const r1 = await createOrgFromCli(db, 'a');
      const r2 = await createOrgFromCli(db, 'church-with-hyphen');
      const r3 = await createOrgFromCli(db, 'a'.repeat(63));
      expect(r1.created).toBe(true);
      expect(r2.created).toBe(true);
      expect(r3.created).toBe(true);
    } finally {
      await db
        .deleteFrom('orgs')
        .where('slug', 'in', ['a', 'church-with-hyphen', 'a'.repeat(63)])
        .execute();
      await db.destroy();
    }
  });
});
