import type { Database, PostStatus, UserRole } from '@prayer/db';
import { newId } from '@prayer/db';
import type { Kysely } from 'kysely';

// ---------------------------------------------------------------------------
// Org
// ---------------------------------------------------------------------------

export interface InsertOrgArgs {
  slug: string;
  displayName?: string;
}

export async function insertOrg(db: Kysely<Database>, args: InsertOrgArgs): Promise<string> {
  const id = newId();
  await db
    .insertInto('orgs')
    .values({
      id,
      slug: args.slug,
      display_name: args.displayName ?? args.slug,
    })
    .execute();
  return id;
}

/** Return the ID of the 'testchurch' org seeded by global-setup.
 *  Use this instead of insertOrg() when inserting users that will authenticate
 *  against the default test host (testchurch.prays.online). */
export async function getTestchurchOrgId(db: Kysely<Database>): Promise<string> {
  const row = await db
    .selectFrom('orgs')
    .select('id')
    .where('slug', '=', 'testchurch')
    .executeTakeFirstOrThrow();
  return row.id;
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export interface TestUser {
  id: string;
  supabaseAuthId: string;
  email: string;
}

export interface InsertUserArgs {
  email?: string;
  orgId: string;
  role?: UserRole;
  displayName?: string;
  supabaseAuthId?: string;
}

export async function insertUser(db: Kysely<Database>, args: InsertUserArgs): Promise<TestUser> {
  const id = newId();
  const supabaseAuthId = args.supabaseAuthId ?? newId();
  const email = args.email ?? `user-${id.replace(/-/g, '')}@test.local`;
  const displayName = args.displayName ?? email.split('@')[0]!;
  await db
    .insertInto('users')
    .values({
      id,
      supabase_auth_id: supabaseAuthId,
      email,
      display_name: displayName,
    })
    .execute();
  await db
    .insertInto('user_orgs')
    .values({
      user_id: id,
      org_id: args.orgId,
      role: args.role ?? 'member',
    })
    .execute();
  return { id, supabaseAuthId, email };
}

// ---------------------------------------------------------------------------
// Post
// ---------------------------------------------------------------------------

export interface TestPostInput {
  authorId: string;
  orgId: string;
  body?: string;
  status?: PostStatus;
  isAnonymous?: boolean;
  parentId?: string | null;
  expiresAt?: Date;
  editDeadline?: Date;
  pinned?: { byUserId: string; durationDays: 1 | 3 | 7 | 14 | 30 };
}

export async function insertPost(
  db: Kysely<Database>,
  input: TestPostInput,
): Promise<{ id: string }> {
  const id = newId();
  const now = new Date();
  const pinned = input.pinned;
  await db
    .insertInto('posts')
    .values({
      id,
      org_id: input.orgId,
      parent_id: input.parentId ?? null,
      author_id: input.authorId,
      status: input.status,
      is_anonymous: input.isAnonymous,
      body: input.body ?? 'Please pray.',
      expires_at: input.expiresAt ?? new Date(now.getTime() + 30 * 24 * 3600_000),
      edit_deadline: input.editDeadline ?? new Date(now.getTime() + 3600_000),
      ...(pinned !== undefined
        ? {
            pinned_at: now,
            pin_until: new Date(now.getTime() + pinned.durationDays * 24 * 3600_000),
            pinned_by: pinned.byUserId,
          }
        : {}),
    })
    .execute();
  return { id };
}

// ---------------------------------------------------------------------------
// Comment
// ---------------------------------------------------------------------------

export interface TestCommentInput {
  postId: string;
  authorId: string;
  orgId: string;
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
      org_id: input.orgId,
      post_id: input.postId,
      author_id: input.authorId,
      participant_id: input.participantId ?? input.authorId,
      body: input.body ?? 'Praying for you.',
      is_hidden: input.isHidden,
    })
    .execute();
  return { id };
}
