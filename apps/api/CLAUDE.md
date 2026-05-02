# apps/api — Claude Guide

Express server behind Supabase Auth. Kysely over Postgres. Tested with supertest + Vitest.

## Layout

```
src/
  app.ts              buildApp(deps) wires middleware + routes; exported for tests
  server.ts           prod entrypoint — loads env, runs migrations, listens
  config/env.ts       re-exports loadApiEnv from @prayer/shared
  db/index.ts         initDb(connectionString) → Kysely<Database>
  lib/jwt.ts          JWKS-backed verifier (jose)
  lib/logger.ts       pino instance + redaction config
  lib/storage.ts      Narrow StorageClient interface wrapping @aws-sdk/client-s3 (tests inject a fake)
  middleware/auth.ts  requireAuth (JIT-creates user row + sanitizeDisplayName), requireMember/Moderator/SuperUser
  middleware/org-context.ts  Resolves req.org from the Host header (slug.prays.online → orgs row); errors loud on stale-multi-org localhost
  middleware/error.ts Error classes + central errorHandler (UnauthorizedError, ForbiddenError, NotFoundError, ValidationError, EditDeadlinePassedError, TooManyRequestsError, PayloadTooLargeError, StorageError, OnboardingRequiredError, CodeNotFoundError/CodeFullError/CodeInactiveError/AlreadyRedeemedError, TooManySuperUsersError/LastSuperUserError)
  middleware/rate-limit.ts   buildLimiter(scope) + 5 scope constants (PREVIEW, ACCEPT, WRITE, REACTION, GLOBAL)
  middleware/origin-check.ts Origin allowlist on mutating verbs (CSRF belt)
  routes/health.ts    GET /healthz (pings DB with 2s timeout)
  routes/me.ts        GET/PATCH /me + POST/DELETE /me/avatar + GET /me/invites
  routes/me-draft.ts  GET /me/draft, PUT /me/draft (upsert), POST /me/draft/publish — single-draft-per-user
  routes/posts.ts     /posts CRUD + /posts/:id/updates + GET /posts/me/archive
  routes/feed.ts      GET /feed (3 sorts + cursor) + GET /feed/snapshot
  routes/comments.ts  /posts/:id/comments CRUD (threaded)
  routes/invitations.ts      /invitations CRUD + /invitations/{preview,accept}
  routes/invite-codes.ts     /me/invite-codes — owner-side invite-code listing
  routes/mod-invite-codes.ts /mod/invite-codes — moderator-side invite-code mint/list/revoke
  routes/notifications.ts    /me/notifications list + mark-read
  routes/moderation.ts       /mod/queue, /mod/hide, /mod/unhide (moderator/super_user gated)
  routes/admin-church.ts     /admin/church/{members,settings,members/:userId} — super_user-only church management (list members, remove, rename church, promote/demote with 3-su cap + 1-su floor)
  services/posts.ts   createPost, publishPost, editPost, archivePost, createUpdate, editUpdate,
                      getOwnDraft, upsertOwnDraft, publishOwnDraft (single draft per user — partial unique index),
                      listArchive, getPostWithUpdates, toPostDto (anonymity mask + hide attribution)
  services/church-admin.ts   listMembers, removeMember, getChurchSettings, updateChurchSettings, changeMemberRole, countSuperUsers; writes admin.* events
  services/orgs.ts           findOrgBySlug, findOrCreateOrg — used by org-context middleware + bootstrap
  services/membership-set.ts In-memory cache of (user_id, org_id) memberships for hot-path auth
  services/users.ts          User lookup helpers
  services/comments.ts       create/edit/archive comments + threading
  services/flags.ts          flagPost/flagComment + dedup per (user, target)
  services/prayers.ts, services/prayer-consumer.ts  Prayer toggle + count recomputer (mirrors reactions)
  services/avatars.ts uploadOwnAvatar, deleteOwnAvatar — writes to S3-compatible storage backend, `avatars/` bucket
  services/feed.ts    fetchFeed (newest|updated|popular) + getSnapshotId; role-aware status filter; batch-fetches reactions per post (same query pattern as prayedSet)
  services/feed-snapshot.ts  getSnapshotId — reads latest published post id from DB
  services/hide-info.ts      fetchHideInfo(db, postIds) — batch loader for latest moderator.hide event per post
  services/events.ts  writePostEvent + writeCommentEvent/writeFlagEvent/writeModerationEvent/writeInvitationEvent
  services/event-worker.ts   LISTEN/NOTIFY consumer dispatching count recomputers + notification builders
  services/reactions.ts      toggleReaction — insert/delete in reactions table + write reaction event; reads denormalised reaction_count (may lag until event-worker runs)
  services/reaction-consumer.ts  reactionCountRecomputer — UPDATE posts/comments SET reaction_count = COUNT(*) FROM reactions
  services/flag-consumer.ts  Auto-hide at ≥2 flags; writes moderator.hide with source='auto', actor_id=null
  services/moderation.ts     hideTarget/unhideTarget — writes moderator.hide/moderator.unhide events
  services/notification-builders/  Per-event builders (comment-created, flag-created, invite-accepted, moderator-hide)
  services/cursor.ts  opaque base64(JSON) cursor encode/decode per sort
  services/expiry-job.ts sweepExpired + createExpirySweeper (node-cron)
  types/express.d.ts  Express Request augmentation for req.user
test/
  global-setup.ts     Drops + recreates public schema, runs migrations, sets env
  setup.ts            Per-test-file setup (empty)
  helpers/jwt.ts      mintTestJwt / mintExpiredJwt using PKCS#8 fixture
  helpers/supertest.ts createTestApp() → supertest agent
  helpers/seed.ts     insertUser / insertPost test data helpers
  helpers/storage.ts  makeInMemoryStorage() — in-memory StorageClient fake injected into createTestApp
  fixtures/           test-jwks.json + test-private-key-pkcs8.pem
```

## Conventions

- **ESM + NodeNext:** relative imports use `.js` extensions even though source is `.ts`.
- **buildApp(deps) pattern:** `app.ts` accepts `{ db, env, logger }` so tests can inject. `server.ts` builds deps from env and calls `buildApp`.
- **Trust proxy is set to 2 hops** (`app.set('trust proxy', 2)` at the top of `buildApp`). Railway's `X-Forwarded-For` is `<real-client>, <railway-internal>`; `trust proxy = 1` strips only one, leaving `req.ip` as the rotating internal IP and breaking rate-limit keying. Don't change this without testing against live Railway.
- **Rate limiting** (`middleware/rate-limit.ts`) runs before routes and is gated by `NODE_ENV !== 'test' && (deps.rateLimitEnabled ?? true)`. `RATE_LIMIT_ENABLED` env (in `packages/shared/src/env.ts`) exists for disabling in staging or flipping back on in per-test app instances. Limiters key by `req.user?.id` for 'user' scope and `req.ip` for 'ip' scope; MemoryStore is per-instance (Railway runs 2 replicas → effective limits double at the cluster level; swap to rate-limit-redis when we scale out).
- **Origin-check middleware** (`middleware/origin-check.ts`) runs on POST/PATCH/PUT/DELETE before routes. Missing Origin passes (server-to-server); spoofed Origin → 403. Allowlist comes from `CORS_ORIGIN` env.
- **Display-name sanitizers — two of them, intentionally different:** `sanitizeDisplayName` (`middleware/auth.ts`) for `users.display_name` allows `\p{L}\p{M}\p{N}` + whitespace/`-`/`'`/`.` (60 cap) — used both at JIT-insert time and by `PATCH /me`. `sanitizeOrgName` (`services/church-admin.ts`) for `orgs.display_name` is looser (allows `&`, parens, slashes — common in church names like "St. John's & Mary's") and only strips `<>&` + ASCII control chars. **Don't narrow either to `\w` or `[a-zA-Z]`:** `\w` without the `u` flag is ASCII-only and silently strips every CJK/Arabic/Devanagari character; `\p{M}` is required so Devanagari vowel signs (`देव` = `द` + `े` + `व`) and similar combining marks survive.
- **Auth middleware chain:** protected routes mount as `requireAuth, requireMember, router`. `requireAuth` verifies JWT against JWKS, looks up user by `supabase_auth_id`, and JIT-inserts a user row on first request (default role `member`, `display_name` from email local-part).
- **Multi-tenancy via Host header:** `middleware/org-context.ts` resolves `req.org` from the request `Host` (e.g. `lakeside.prays.online` → orgs row with slug=`lakeside`). Routes scope all queries by `req.user.orgId`. Localhost falls back to single-org-in-DB; multi-org-localhost is a hard error (see Known rough edges). **Cache contract:** the resolver LRU-caches by host with a 5-minute TTL. Any route that mutates a column surfaced via `req.org.*` (currently `display_name`) MUST call `deps.orgResolver.invalidateByOrgId(req.user.orgId)` after the write — otherwise readers see stale values for up to 5 min (one orgId can sit behind multiple cached hostnames: web `<slug>.prays.online`, `api.<slug>.prays.online`, custom domains, `localhost`).
- **Admin event kinds:** `admin.member_removed`, `admin.org_settings_updated`, `admin.role_changed` — written by `services/church-admin.ts` via `writeAdminEvent` in the same transaction as the data mutation. Used for the audit trail surfaced to super_users.
- **JWKS source:** in tests, `AUTH_JWKS_URL` is `file://…/test-jwks.json`; in prod it points at the auth provider's `/.well-known/jwks.json` (Supabase or local GoTrue). `jose` handles both via `createRemoteJWKSet` + `fetch`; tests rely on Node's `fetch` supporting `file:` URLs.
- **JWT signing in tests:** uses RS256 + PKCS#8 key (required by `jose.importPKCS8`). Do NOT reintroduce PKCS#1 keys.
- **Error handling:** throw typed errors from `middleware/error.ts` (`UnauthorizedError`, `ForbiddenError`, `NotFoundError`). The central `errorHandler` maps them to JSON responses. Don't write `res.status(401).json(...)` ad hoc.
- **Logging:** route handlers log via `req.log` (pino-http child). Redact `authorization` header and `token` fields. Do not log raw request bodies.
- **Anonymity masking lives in the DTO layer.** `toPostDto(row, caller)` strips `author_id` + `display_name` when `is_anonymous && caller.role !== 'super_user'`. Every route that returns post data passes through this mapper — don't rely on middleware or ad-hoc masking.
- **DTO also exposes `is_own_post: boolean`** computed from the real `author_id` BEFORE the anonymity mask, so clients can gate "mine vs not mine" UI (edit/delete permissions, hiding the Report button) on anonymous posts without seeing the author's identity.
- **Hide attribution:** `PostDto.hidden_by: {id, display_name} | null` and `hidden_source: 'auto' | 'manual' | null` are populated only for moderator/super_user callers on hidden posts. Backed by a batch lookup in `services/hide-info.ts` against the latest `moderator.hide` event per post. `actor_id` is null on auto-hides (2-flag threshold).
- **Events outbox:** every post mutation (`createPost`, `publishPost`, `editPost`, `archivePost`, `createUpdate`) writes an `events` row inside the same transaction via `writePostEvent`. Payload shapes are fixed per kind (see `services/events.ts`). Consumed by `services/event-worker.ts` (LISTEN/NOTIFY) — count recomputers, notification builders, flag auto-hide, and feed snapshot.
- **Expiry cron:** `createExpirySweeper` is started in `buildApp` (skipped when `NODE_ENV=test`) and stopped on SIGTERM/SIGINT in `server.ts`. Query is idempotent (`WHERE status='published' AND expires_at < NOW()`).
- **Kysely + hand-written row types:** a `.select([...])` result doesn't cleanly assign to a plain-`Date` interface like `PostRow` because Kysely infers `Generated<Timestamp>`. Cast via `as unknown as PostRow[]` — the pattern is established in `services/posts.ts#fetchPostRow`.
- **Route ordering:** literal-prefix routes (e.g. `/posts/me/archive`) must be declared **before** `/posts/:id` or Express matches `me` as the id. Group `me/*` routes near the top of the router.
- **Drafts:** one draft per user, enforced by the partial unique index `one_draft_per_user_idx` on `posts(author_id) WHERE status='draft' AND parent_id IS NULL`. Drafts bypass `edit_deadline`; the 1-hour window only starts at publish. Use `/me/draft` endpoints (upsert + publish); there is no list endpoint. **Publish is DELETE+INSERT in one transaction** (not UPDATE-in-place) so the published row gets a fresh UUIDv7 `id` and column-default `created_at` reflecting the publish moment — keeps feed ordering and "X ago" displays accurate even if the draft sat unpublished for days. Drafts have no FK references (comments/reactions/prayers all gate on `status='published'`), so the DELETE has no cascade.
- **Postgres has no `max(uuid)` aggregate** — when aggregating UUIDs, cast to text: `sql\`max(posts.id::text)\``. See `services/feed.ts#getSnapshotId`.

## Testing

- Vitest runs with `globalSetup: test/global-setup.ts` — the schema is dropped + migrated once per run. Individual tests should NOT start transactions themselves; if a test needs clean data, delete specific rows in `afterEach`.
- Use `createTestApp({ db, env })` from `test/helpers/supertest.ts`. It builds a fresh `app` with injected deps. Never import `src/server.ts` from tests.
- Mint JWTs with `mintTestJwt({ sub, email })`. `sub` is the Supabase auth id — it maps to `users.supabase_auth_id`.

## Commands

```
pnpm --filter @prayer/api dev        # tsx watch (run from repo root)
pnpm --filter @prayer/api test
pnpm --filter @prayer/api typecheck
pnpm --filter @prayer/api build      # tsc → dist/
```

## Gotchas

- `server.ts` env loading depends on cwd — run dev from the repo root.
- **Migration numbering:** run `ls packages/db/migrations/` before writing a new SQL file — the next number is sequential (not guessable from context).
- Kysely treats `ColumnType<T, never, never>` columns as read-only: they're selectable but cannot appear in `.values()` / `.set()`. Use this for `popularity_count` (Postgres-generated).
- The `requireAuth` middleware currently does a round-trip to the DB on every request to resolve the user. Fine for M1 scale; if it becomes a hotspot, cache by `supabase_auth_id`.
