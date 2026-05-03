import type { Database, PostStatus, UserRole } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';

export interface TestUser {
  id: string;
  supabaseAuthId: string;
  email: string;
}

export async function insertUser(
  db: Kysely<Database>,
  opts: { role?: UserRole; email?: string } = {},
): Promise<TestUser> {
  const id = newId();
  const supabaseAuthId = newId();
  const email = opts.email ?? `user-${id.replace(/-/g, '')}@test.local`;
  await db
    .insertInto('users')
    .values({
      id,
      supabase_auth_id: supabaseAuthId,
      email,
      display_name: email.split('@')[0]!,
      role: opts.role,
    })
    .execute();
  return { id, supabaseAuthId, email };
}

export interface TestPostInput {
  authorId: string;
  body?: string;
  status?: PostStatus;
  isAnonymous?: boolean;
  parentId?: string | null;
  expiresAt?: Date;
  editDeadline?: Date;
}

export async function insertPost(
  db: Kysely<Database>,
  input: TestPostInput,
): Promise<{ id: string }> {
  const id = newId();
  const now = new Date();
  await db
    .insertInto('posts')
    .values({
      id,
      parent_id: input.parentId ?? null,
      author_id: input.authorId,
      status: input.status,
      is_anonymous: input.isAnonymous,
      body: input.body ?? 'Please pray.',
      expires_at: input.expiresAt ?? new Date(now.getTime() + 30 * 24 * 3600_000),
      edit_deadline: input.editDeadline ?? new Date(now.getTime() + 3600_000),
    })
    .execute();
  return { id };
}

export interface TestCommentInput {
  postId: string;
  authorId: string;
  participantId?: string;
  body?: string;
  isHidden?: boolean;
}

export async function insertComment(
  db: Kysely<Database>,
  input: TestCommentInput,
): Promise<{ id: string }> {
  const id = newId();
  await db
    .insertInto('comments')
    .values({
      id,
      post_id: input.postId,
      author_id: input.authorId,
      participant_id: input.participantId ?? input.authorId,
      body: input.body ?? 'Praying for you.',
      is_hidden: input.isHidden,
    })
    .execute();
  return { id };
}
