import { createDb, newId } from '@prayer/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StorageClient, StorageFileItem } from '../../src/lib/storage.js';
import { deleteOwnAvatar, uploadOwnAvatar } from '../../src/services/avatars.js';

const db = createDb(process.env.DATABASE_URL!);
const BUCKET = 'avatars';
const PUBLIC_URL_BASE = `https://example.supabase.co/storage/v1/object/public/${BUCKET}`;

function fakeStorage(seed: Record<string, Buffer> = {}): StorageClient & {
  objects: Record<string, Buffer>;
  uploadCalls: Array<{ bucket: string; path: string; contentType: string }>;
  removeCalls: Array<{ bucket: string; paths: string[] }>;
} {
  const objects = { ...seed };
  const uploadCalls: Array<{ bucket: string; path: string; contentType: string }> = [];
  const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
  return {
    objects,
    uploadCalls,
    removeCalls,
    async upload(bucket, path, body, opts) {
      uploadCalls.push({ bucket, path, contentType: opts.contentType });
      objects[`${bucket}/${path}`] = body;
    },
    async remove(bucket, paths) {
      removeCalls.push({ bucket, paths });
      for (const p of paths) {
        delete objects[`${bucket}/${p}`];
      }
    },
    async list(bucket, prefix): Promise<StorageFileItem[]> {
      const wanted = `${bucket}/${prefix}`;
      return Object.keys(objects)
        .filter((k) => k.startsWith(wanted))
        .map((k) => ({ name: k.slice(`${bucket}/${prefix}`.length) }));
    },
  };
}

async function insertUser(displayName: string): Promise<{ id: string; supabaseAuthId: string }> {
  const id = newId();
  const supabaseAuthId = newId();
  await db
    .insertInto('users')
    .values({
      id,
      supabase_auth_id: supabaseAuthId,
      email: `${id}@example.com`,
      display_name: displayName,
    })
    .execute();
  return { id, supabaseAuthId };
}

afterEach(async () => {
  await db.deleteFrom('invitations').execute();
  await db.deleteFrom('invite_codes').execute();
  await db.deleteFrom('users').execute();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-22T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('uploadOwnAvatar', () => {
  it('uploads to the correct key and records the URL', async () => {
    const user = await insertUser('Alice');
    const storage = fakeStorage();
    const out = await uploadOwnAvatar(db, storage, {
      userId: user.id,
      supabaseAuthId: user.supabaseAuthId,
      imageBuffer: Buffer.from('fake-webp-bytes'),
      contentType: 'image/webp',
      publicUrlBase: PUBLIC_URL_BASE,
    });

    const ts = Date.now();
    const expectedKey = `avatars/${user.supabaseAuthId}/${ts}.webp`;
    expect(storage.uploadCalls).toHaveLength(1);
    expect(storage.uploadCalls[0]).toMatchObject({
      bucket: BUCKET,
      path: expectedKey,
      contentType: 'image/webp',
    });
    expect(out.avatar_url).toBe(`${PUBLIC_URL_BASE}/${expectedKey}`);

    const row = await db
      .selectFrom('users')
      .select('avatar_url')
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    expect(row.avatar_url).toBe(out.avatar_url);
  });

  it('removes prior objects under the user folder (best-effort)', async () => {
    const user = await insertUser('Bob');
    const storage = fakeStorage({
      [`${BUCKET}/avatars/${user.supabaseAuthId}/1000.webp`]: Buffer.from('old-1'),
      [`${BUCKET}/avatars/${user.supabaseAuthId}/2000.webp`]: Buffer.from('old-2'),
    });
    await uploadOwnAvatar(db, storage, {
      userId: user.id,
      supabaseAuthId: user.supabaseAuthId,
      imageBuffer: Buffer.from('new'),
      contentType: 'image/webp',
      publicUrlBase: PUBLIC_URL_BASE,
    });

    const removed = storage.removeCalls.flatMap((c) => c.paths);
    expect(removed).toContain(`avatars/${user.supabaseAuthId}/1000.webp`);
    expect(removed).toContain(`avatars/${user.supabaseAuthId}/2000.webp`);
    const ts = Date.now();
    expect(storage.objects[`${BUCKET}/avatars/${user.supabaseAuthId}/${ts}.webp`]).toBeDefined();
  });

  it('wraps upload errors in StorageError', async () => {
    const user = await insertUser('Carol');
    const storage: StorageClient = {
      upload: async () => {
        throw new Error('network down');
      },
      remove: async () => {},
      list: async () => [],
    };
    await expect(
      uploadOwnAvatar(db, storage, {
        userId: user.id,
        supabaseAuthId: user.supabaseAuthId,
        imageBuffer: Buffer.from('x'),
        contentType: 'image/webp',
        publicUrlBase: PUBLIC_URL_BASE,
      }),
    ).rejects.toHaveProperty('code', 'STORAGE_ERROR');
  });
});

describe('deleteOwnAvatar', () => {
  it('removes all objects under the user folder and nulls the column', async () => {
    const user = await insertUser('Dana');
    await db
      .updateTable('users')
      .set({ avatar_url: 'https://example.com/old' })
      .where('id', '=', user.id)
      .execute();
    const storage = fakeStorage({
      [`${BUCKET}/avatars/${user.supabaseAuthId}/1000.webp`]: Buffer.from('a'),
      [`${BUCKET}/avatars/${user.supabaseAuthId}/2000.webp`]: Buffer.from('b'),
    });

    await deleteOwnAvatar(db, storage, {
      userId: user.id,
      supabaseAuthId: user.supabaseAuthId,
    });

    expect(storage.objects[`${BUCKET}/avatars/${user.supabaseAuthId}/1000.webp`]).toBeUndefined();
    expect(storage.objects[`${BUCKET}/avatars/${user.supabaseAuthId}/2000.webp`]).toBeUndefined();
    const row = await db
      .selectFrom('users')
      .select('avatar_url')
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    expect(row.avatar_url).toBeNull();
  });

  it('is a no-op when there are no prior objects', async () => {
    const user = await insertUser('Evan');
    const storage = fakeStorage();
    await deleteOwnAvatar(db, storage, {
      userId: user.id,
      supabaseAuthId: user.supabaseAuthId,
    });
    expect(storage.removeCalls).toHaveLength(0);
  });
});
