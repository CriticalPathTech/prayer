import { describe, expect, it } from 'vitest';

import { createDb } from '../src/client.js';
import { newId } from '../src/ids.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;

describe('post_images schema', () => {
  it('accepts a row with a null post_id and rejects position outside 0..2', async () => {
    const db = createDb(TEST_DATABASE_URL);
    let org: { id: string } | undefined;
    let user: { id: string } | undefined;
    try {
      org = await db
        .insertInto('orgs')
        .values({
          id: newId(),
          slug: `post-images-test-${newId()}`,
          display_name: 'Post Images Test Org',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      user = await db
        .insertInto('users')
        .values({
          id: newId(),
          supabase_auth_id: newId(),
          email: `post-images-test-${newId()}@example.com`,
          display_name: 'Post Images Test User',
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      const id = newId();
      await db
        .insertInto('post_images')
        .values({
          id,
          org_id: org.id,
          owner_id: user.id,
          post_id: null,
          position: 0,
          storage_key: `posts/${id}.webp`,
          thumb_key: `posts/${id}_thumb.webp`,
          width: 1600,
          height: 900,
          byte_size: 123_456,
        })
        .execute();

      const row = await db
        .selectFrom('post_images')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(row.post_id).toBeNull();
      expect(row.purged_at).toBeNull();

      await expect(
        db
          .insertInto('post_images')
          .values({
            id: newId(),
            org_id: org.id,
            owner_id: user.id,
            post_id: null,
            position: 3,
            storage_key: 'x',
            thumb_key: 'y',
            width: 1,
            height: 1,
            byte_size: 1,
          })
          .execute(),
      ).rejects.toThrow();
    } finally {
      if (org) await db.deleteFrom('post_images').where('org_id', '=', org.id).execute();
      if (user) await db.deleteFrom('users').where('id', '=', user.id).execute();
      if (org) await db.deleteFrom('orgs').where('id', '=', org.id).execute();
      await db.destroy();
    }
  });
});
