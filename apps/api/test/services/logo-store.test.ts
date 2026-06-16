import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { initDb } from '../../src/db/index.js';
import { ValidationError } from '../../src/middleware/error.js';
import { getOrgLogo, removeOrgLogo, saveOrgLogo } from '../../src/services/logo.js';
import { insertOrg } from '../helpers/seed.js';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="currentColor" d="M0 0h10v10H0z"/></svg>';

describe('org logo storage', () => {
  let db: ReturnType<typeof initDb>;
  let orgId: string;

  beforeAll(async () => {
    db = initDb(process.env.TEST_DATABASE_URL!);
    orgId = await insertOrg(db, { slug: 'logo-store', displayName: 'Logo Store' });
  });
  afterAll(async () => {
    await db.destroy();
  });
  beforeEach(async () => {
    await removeOrgLogo(db, orgId);
  });

  it('returns null when no logo set', async () => {
    expect(await getOrgLogo(db, orgId)).toBeNull();
  });

  it('saves and reads back an original-mode logo', async () => {
    const saved = await saveOrgLogo(db, { orgId, svg: SVG, fillMode: 'original' });
    expect(saved.fillMode).toBe('original');
    expect(saved.color).toBeNull();
    const got = await getOrgLogo(db, orgId);
    expect(got?.svg).toContain('<svg');
    expect(got?.fillMode).toBe('original');
  });

  it('requires a hex color for custom mode', async () => {
    await expect(saveOrgLogo(db, { orgId, svg: SVG, fillMode: 'custom' })).rejects.toThrow(
      ValidationError,
    );
    await expect(
      saveOrgLogo(db, { orgId, svg: SVG, fillMode: 'custom', color: 'red' }),
    ).rejects.toThrow(ValidationError);
  });

  it('stores a normalized custom color', async () => {
    const saved = await saveOrgLogo(db, { orgId, svg: SVG, fillMode: 'custom', color: '#AABBCC' });
    expect(saved.color).toBe('#aabbcc');
  });

  it('rejects an unknown fill mode', async () => {
    await expect(
      // @ts-expect-error testing invalid input
      saveOrgLogo(db, { orgId, svg: SVG, fillMode: 'rainbow' }),
    ).rejects.toThrow(ValidationError);
  });

  it('remove clears the logo back to null', async () => {
    await saveOrgLogo(db, { orgId, svg: SVG, fillMode: 'original' });
    await removeOrgLogo(db, orgId);
    expect(await getOrgLogo(db, orgId)).toBeNull();
  });
});
