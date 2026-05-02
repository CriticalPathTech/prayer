import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import { BOOTSTRAP_COMMENTS, BOOTSTRAP_POSTS } from './bootstrap-data.js';
import { createDb, type Db } from './client.js';
import { newId } from './ids.js';
import { mintInviteCode } from './invite-codes.js';
import { generatePassword } from './passwords.js';
import type { UserRole } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

export interface SupabaseCredentials {
  email: string;
  password: string;
}

export async function createOrReuseSupabaseUser(
  supabase: SupabaseClient,
  creds: SupabaseCredentials,
): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email: creds.email,
    password: creds.password,
    email_confirm: true,
  });

  if (!error) {
    if (!data.user) {
      throw new Error(`Supabase returned no user for ${creds.email}`);
    }
    return data.user.id;
  }

  const alreadyExists =
    error.status === 422 || (error as { code?: string }).code === 'email_exists';
  if (!alreadyExists) {
    throw error;
  }

  // Look up the existing user. listUsers defaults to 50/page — sufficient
  // for bootstrap scale. If the project ever grows past that, switch to
  // the search-by-email API.
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = listData.users.find((u) => u.email === creds.email);
  if (!existing) {
    throw new Error(`Supabase reports ${creds.email} exists but did not return it`);
  }
  return existing.id;
}

// Spec for placeholder users seeded by bootstrap. Email is slug-prefixed
// so two churches in the same DB don't collide. Display names stay
// slug-agnostic so a future "rename placeholder users" tool doesn't
// reveal the church the placeholder originally belonged to.
export interface BootstrapUserSpec {
  email: string;
  displayName: string;
  role: UserRole;
}

/** Default email domain when neither --domain nor BOOTSTRAP_EMAIL_DOMAIN is set.
 * Uses example.com (RFC 2606 reserved for documentation) so the OSS Quickstart
 * doesn't mint placeholder users at a real domain that the operator may not own. */
export const DEFAULT_BOOTSTRAP_EMAIL_DOMAIN = 'example.com';

// Emails are slug-derived so two churches in the same DB don't collide.
// Display names stay slug-agnostic so a future "rename placeholder users"
// tool doesn't reveal the church the placeholder originally belonged to.
export function bootstrapUsersForSlug(slug: string, domain: string): BootstrapUserSpec[] {
  return [
    { email: `${slug}su@${domain}`, displayName: 'Super User', role: 'super_user' },
    { email: `${slug}mod1@${domain}`, displayName: 'Moderator One', role: 'moderator' },
    { email: `${slug}mod2@${domain}`, displayName: 'Moderator Two', role: 'moderator' },
    { email: `${slug}mem1@${domain}`, displayName: 'Member One', role: 'member' },
    { email: `${slug}mem2@${domain}`, displayName: 'Member Two', role: 'member' },
  ];
}

export interface BootstrapOptions {
  slug: string;
  /** Email domain for slug-derived placeholder users. */
  emailDomain: string;
  skipSeed: boolean;
}

export interface BootstrapDeps {
  db: Db;
  supabase: SupabaseClient;
}

export interface BootstrapCredential {
  role: UserRole;
  email: string;
  /** Either the freshly-generated password (for newly-created users in cloud
   * mode), the literal "prayer-dev-local" (local mode), or the marker string
   * "(reused — password unchanged)" for users that already existed. */
  passwordOrNote: string;
}

export interface BootstrapResult {
  usersCreated: number;
  usersReused: number;
  postsCreated: number;
  commentsCreated: number;
  credentials: BootstrapCredential[];
}

// Per-org freshness check: an org is "fresh" if it has no posts yet. Posts
// are a better signal than users because the same Supabase identity can
// belong to many orgs; in a multi-tenant DB the global users table is never
// empty after the first org is bootstrapped.
export async function isFreshOrg(db: Db, orgId: string): Promise<boolean> {
  const row = await db
    .selectFrom('posts')
    .select(({ fn }) => fn.count<number>('id').as('count'))
    .where('org_id', '=', orgId)
    .executeTakeFirstOrThrow();
  return Number(row.count) === 0;
}

export interface FindOrCreateOrgResult {
  id: string;
  created: boolean;
}

export async function findOrCreateOrg(
  db: Db,
  slug: string,
  displayName: string,
): Promise<FindOrCreateOrgResult> {
  const existing = await db
    .selectFrom('orgs')
    .where('slug', '=', slug)
    .select('id')
    .executeTakeFirst();
  if (existing) return { id: existing.id, created: false };
  const id = newId();
  await db.insertInto('orgs').values({ id, slug, display_name: displayName }).execute();
  return { id, created: true };
}

export async function upsertAppUser(
  db: Db,
  supabaseAuthId: string,
  user: BootstrapUserSpec,
  orgId: string,
): Promise<string> {
  const result = await db
    .insertInto('users')
    .values({
      id: newId(),
      supabase_auth_id: supabaseAuthId,
      email: user.email,
      display_name: user.displayName,
    })
    .onConflict((oc) =>
      oc.column('supabase_auth_id').doUpdateSet({
        email: user.email,
        display_name: user.displayName,
      }),
    )
    .returning('id')
    .executeTakeFirstOrThrow();

  await db
    .insertInto('user_orgs')
    .values({ user_id: result.id, org_id: orgId, role: user.role })
    // First-write-wins: bootstrap seeds the role on first install but does NOT
    // override existing memberships on re-run. This protects users whose role
    // was promoted out-of-band (e.g., via M4+ admin tooling) from being silently
    // demoted back to the fixture default.
    .onConflict((oc) => oc.columns(['user_id', 'org_id']).doNothing())
    .execute();

  return result.id;
}

export async function mintInviteCodeIfMissing(
  db: Db,
  ownerId: string,
  orgId: string,
): Promise<boolean> {
  const existing = await db
    .selectFrom('invite_codes')
    .select('id')
    .where('owner_id', '=', ownerId)
    .where('org_id', '=', orgId)
    .limit(1)
    .executeTakeFirst();
  if (existing) return false;
  await mintInviteCode(db, { ownerId, orgId, seatCap: 3 });
  return true;
}

export async function seedPosts(
  db: Db,
  userIds: string[],
  orgId: string,
  fresh: boolean,
): Promise<string[]> {
  if (!fresh) return [];

  const now = new Date();
  const createdIds: string[] = [];

  for (const fixture of BOOTSTRAP_POSTS) {
    const authorId = userIds[fixture.authorIndex];
    if (!authorId) {
      throw new Error(
        `seedPosts: authorIndex ${fixture.authorIndex} out of range for userIds[${userIds.length}]`,
      );
    }
    const expiresAt = new Date(now.getTime() + fixture.expiresInDays * 24 * 60 * 60 * 1000);
    // edit_deadline is NOT NULL with no default — use 24 h from now as a sensible sentinel
    const editDeadline = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const id = newId();
    await db
      .insertInto('posts')
      .values({
        id,
        org_id: orgId,
        parent_id: null,
        author_id: authorId,
        body: fixture.body,
        status: fixture.status,
        is_anonymous: fixture.isAnonymous,
        expires_at: expiresAt,
        edit_deadline: editDeadline,
      })
      .execute();
    createdIds.push(id);
  }
  return createdIds;
}

export async function seedComments(
  db: Db,
  userIds: string[],
  postIds: string[],
  orgId: string,
  fresh: boolean,
): Promise<number> {
  if (!fresh) return 0;

  let count = 0;
  for (const c of BOOTSTRAP_COMMENTS) {
    const postId = postIds[c.postIndex];
    const authorId = userIds[c.authorIndex];
    if (!postId || !authorId) {
      throw new Error(
        `seedComments: index out of range — postIndex ${c.postIndex}, authorIndex ${c.authorIndex}`,
      );
    }
    await db
      .insertInto('comments')
      .values({
        id: newId(),
        org_id: orgId,
        post_id: postId,
        author_id: authorId,
        // participant_id is NOT NULL with no default; use author_id as the
        // sensible seed-time value (mirrors the backfill migration pattern).
        participant_id: authorId,
        body: c.body,
      })
      .execute();
    count += 1;
  }
  return count;
}

function parseArgs(argv: string[]): BootstrapOptions {
  const opts: BootstrapOptions = {
    slug: 'hope',
    emailDomain: process.env.BOOTSTRAP_EMAIL_DOMAIN ?? DEFAULT_BOOTSTRAP_EMAIL_DOMAIN,
    skipSeed: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--slug') opts.slug = argv[++i] ?? opts.slug;
    else if (arg === '--domain') opts.emailDomain = argv[++i] ?? opts.emailDomain;
    else if (arg === '--skip-seed') opts.skipSeed = true;
  }
  return opts;
}

function printSummary(result: BootstrapResult, opts: BootstrapOptions): void {
  console.log('');
  // display name = slug; super_user can rename later via UI.
  console.log(`Bootstrap complete for org "${opts.slug}".`);
  console.log(`  users created:  ${result.usersCreated}`);
  console.log(`  users reused:   ${result.usersReused}`);
  console.log(`  posts created:  ${result.postsCreated}`);
  console.log(`  comments:       ${result.commentsCreated}`);
  console.log('');
  console.log('  ' + '─'.repeat(58));
  console.log('  Initial credentials — hand these to the church admin');
  console.log('  out-of-band (do NOT email or paste in chat).');
  console.log('  ' + '─'.repeat(58));
  for (const cred of result.credentials) {
    const role = cred.role.padEnd(11);
    const email = cred.email.padEnd(38);
    console.log(`  ${role} ${email} ${cred.passwordOrNote}`);
  }
  console.log('  ' + '─'.repeat(58));
  console.log('');
  console.log(`  Tell the admin to log in at https://${opts.slug}.<your-domain>/`);
  console.log('');
}

export async function bootstrap(
  deps: BootstrapDeps,
  opts: BootstrapOptions,
): Promise<BootstrapResult> {
  const { db, supabase } = deps;

  // bootstrap no longer provisions orgs; admin:create-org owns that.
  const orgRow = await db
    .selectFrom('orgs')
    .where('slug', '=', opts.slug)
    .select('id')
    .executeTakeFirst();
  if (!orgRow) {
    throw new Error(
      `bootstrap: org "${opts.slug}" not found. Run \`pnpm admin:create-org --slug ${opts.slug}\` first, then re-run bootstrap.`,
    );
  }
  const orgId = orgRow.id;

  const fresh = await isFreshOrg(db, orgId);
  const seedContent = fresh && !opts.skipSeed;

  let usersCreated = 0;
  let usersReused = 0;
  const userIds: string[] = [];

  const users = bootstrapUsersForSlug(opts.slug, opts.emailDomain);
  const isCloud = process.env.BOOTSTRAP_ALLOW_REMOTE === '1';
  const credentials: BootstrapCredential[] = [];

  for (const u of users) {
    const beforeUserCount = await db
      .selectFrom('users')
      .select(({ fn }) => fn.count<number>('id').as('count'))
      .where('email', '=', u.email)
      .executeTakeFirstOrThrow();
    const isNewUser = Number(beforeUserCount.count) === 0;

    // Only generate a password for users we're CREATING. Reused users keep
    // whatever password Supabase already has — we can't recover it.
    const password = isNewUser ? (isCloud ? generatePassword() : 'prayer-dev-local') : null;

    // createOrReuseSupabaseUser ignores the password when Supabase already
    // has the email (createUser returns 422, we look up the existing id).
    // The placeholder is only ever sent for the createUser attempt, never
    // persisted in the reused path.
    const supabaseId = await createOrReuseSupabaseUser(supabase, {
      email: u.email,
      password: password ?? 'unused-existing-account-password-ignored',
    });

    const userId = await upsertAppUser(db, supabaseId, u, orgId);
    userIds.push(userId);

    if (isNewUser) usersCreated += 1;
    else usersReused += 1;

    credentials.push({
      role: u.role,
      email: u.email,
      passwordOrNote: isNewUser ? password! : '(reused — password unchanged)',
    });

    await mintInviteCodeIfMissing(db, userId, orgId);
  }

  const postIds = await seedPosts(db, userIds, orgId, seedContent);
  const commentsCreated = await seedComments(db, userIds, postIds, orgId, seedContent);

  return {
    usersCreated,
    usersReused,
    postsCreated: postIds.length,
    commentsCreated,
    credentials,
  };
}

// Refuse to run against anything that isn't obviously local. A misconfigured
// .env (e.g., `AUTH_URL` left pointing at a hosted Supabase project) would
// otherwise have bootstrap silently create test users + sample posts in a
// real tenant. Defence in depth on top of the NODE_ENV=production check.
//
// Cloud-onboarding workflow (creating a fresh tenant in a remote Supabase
// project) is a legitimate use case — operators opt out of the local-only
// guard by setting BOOTSTRAP_ALLOW_REMOTE=1. The guard remains the default
// to keep self-hosters and contributors from accidentally writing to a real
// project.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
function assertLocalUrl(label: string, raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`bootstrap: ${label} is not a valid URL: ${raw}`);
  }
  if (process.env.BOOTSTRAP_ALLOW_REMOTE === '1') {
    return;
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `bootstrap refuses non-local ${label}: ${url.hostname}\n` +
        `  Allowed hostnames: ${[...LOCAL_HOSTS].join(', ')}\n` +
        `  Bootstrap seeds local Docker stacks by default. To intentionally seed\n` +
        `  a remote tenant (cloud onboarding), re-run with BOOTSTRAP_ALLOW_REMOTE=1.`,
    );
  }
}

// Top-level invocation when called via `tsx packages/db/src/bootstrap.ts`
if (process.argv[1] === __filename) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('bootstrap must not run in production');
  }
  const authUrl = process.env.AUTH_URL;
  const adminKey = process.env.AUTH_ADMIN_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  if (!authUrl || !adminKey || !databaseUrl) {
    throw new Error('AUTH_URL, AUTH_ADMIN_KEY, and DATABASE_URL are required');
  }
  if (process.env.BOOTSTRAP_ALLOW_REMOTE === '1') {
    const authHost = new URL(authUrl).hostname;
    const dbHost = new URL(databaseUrl).hostname;
    console.warn(
      `bootstrap: BOOTSTRAP_ALLOW_REMOTE=1 — seeding remote tenant\n` +
        `  AUTH_URL host:     ${authHost}\n` +
        `  DATABASE_URL host: ${dbHost}\n`,
    );
  }
  assertLocalUrl('AUTH_URL', authUrl);
  assertLocalUrl('DATABASE_URL', databaseUrl);
  const supabase = createClient(authUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = createDb(databaseUrl);
  const opts = parseArgs(process.argv.slice(2));
  bootstrap({ db, supabase }, opts)
    .then((result) => {
      printSummary(result, opts);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => db.destroy());
}
