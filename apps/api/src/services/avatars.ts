// services/avatars.ts handles avatar uploads to S3-compatible storage.
//
// Multi-tenant note: storage paths are NOT scoped by org_id in Phase 1. Avatars
// live at the flat path `avatars/<user_id>.jpg`. This is intentional —
//   1. The `users` table is global to identity (Option C: one Supabase identity
//      per email, many user_orgs memberships per identity), so a user's avatar
//      is the same image across every org they belong to.
//   2. Migrating to per-org-scoped storage paths (e.g., `orgs/<org_id>/users/<id>.jpg`)
//      is a separate concern, deferred until we either move off Supabase Storage
//      or have a real isolation requirement.
//
// The `users.avatar_url` column is per-user (no org_id). The avatar URL itself
// embeds the user_id only.

import type { Database } from '@prayer/db';
import type { Kysely } from 'kysely';

import type { StorageClient } from '../lib/storage.js';
import { StorageError } from '../middleware/error.js';

const BUCKET = 'avatars';

function userFolder(supabaseAuthId: string): string {
  return `avatars/${supabaseAuthId}/`;
}

function objectKey(supabaseAuthId: string, timestamp: number): string {
  return `${userFolder(supabaseAuthId)}${timestamp}.webp`;
}

function publicUrl(publicUrlBase: string, key: string): string {
  return `${publicUrlBase.replace(/\/$/, '')}/${key}`;
}

export interface UploadOwnAvatarInput {
  userId: string;
  supabaseAuthId: string;
  imageBuffer: Buffer;
  contentType: string;
  publicUrlBase: string;
}

export interface UploadOwnAvatarResult {
  avatar_url: string;
}

export async function uploadOwnAvatar(
  db: Kysely<Database>,
  storage: StorageClient,
  input: UploadOwnAvatarInput,
): Promise<UploadOwnAvatarResult> {
  const timestamp = Date.now();
  const key = objectKey(input.supabaseAuthId, timestamp);

  try {
    await storage.upload(BUCKET, key, input.imageBuffer, {
      contentType: input.contentType,
    });
  } catch {
    throw new StorageError();
  }

  const avatarUrl = publicUrl(input.publicUrlBase, key);

  await db
    .updateTable('users')
    .set({ avatar_url: avatarUrl })
    .where('id', '=', input.userId)
    .execute();

  try {
    const items = await storage.list(BUCKET, userFolder(input.supabaseAuthId));
    const stalePaths = items
      .map((i) => `${userFolder(input.supabaseAuthId)}${i.name}`)
      .filter((p) => p !== key);
    if (stalePaths.length > 0) {
      await storage.remove(BUCKET, stalePaths);
    }
  } catch {
    // swallow; the stale objects can be cleaned up on next upload or deletion.
  }

  return { avatar_url: avatarUrl };
}

export interface DeleteOwnAvatarInput {
  userId: string;
  supabaseAuthId: string;
}

export async function deleteOwnAvatar(
  db: Kysely<Database>,
  storage: StorageClient,
  input: DeleteOwnAvatarInput,
): Promise<void> {
  const items = await storage.list(BUCKET, userFolder(input.supabaseAuthId));
  const paths = items.map((i) => `${userFolder(input.supabaseAuthId)}${i.name}`);
  if (paths.length > 0) {
    try {
      await storage.remove(BUCKET, paths);
    } catch {
      throw new StorageError();
    }
  }

  await db.updateTable('users').set({ avatar_url: null }).where('id', '=', input.userId).execute();
}
