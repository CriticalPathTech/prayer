# Prayer App — Project Guide for Claude

Private, invite-only prayer request app for a church community. pnpm workspaces monorepo.

## Layout

```
apps/api          Express + Kysely backend (@prayer/api)
apps/web          Vite + React frontend (@prayer/web)
packages/db       Kysely schema types, migrations (SQL), bootstrap, shared invite-code helpers (@prayer/db)
packages/shared   Shared zod-validated env parsers (@prayer/shared)
docker/           Local stack fixtures: gotrue-jwt/ (RS256 dev keypair), gotrue-proxy/ (nginx config), init-db.sh
docs/             self-hosting.md
```

## Stack

- Node 24 (`engines.node: ">=24"`), pnpm 9, TypeScript 5 (strict, `noUncheckedIndexedAccess`, project references)
- ESM + `"module": "NodeNext"` everywhere → **relative imports MUST use `.js` extensions** (e.g., `import { x } from './foo.js'`), even though source is `.ts`. The web app is the exception: Vite uses Bundler resolution, so web source code does NOT use `.js` suffixes.
- Postgres 16, node-pg-migrate (raw SQL migrations), Kysely as query builder
- Supabase for auth only (no Supabase DB client on server; verify JWTs via JWKS with `jose`)
- Pino for structured logs; Vitest + supertest / RTL for tests

## Commands (run from repo root)

```
pnpm install
pnpm db:up              # legacy — starts only Postgres. Prefer `docker compose up -d postgres gotrue` (see Dev modes / Known rough edges)
pnpm db:migrate         # apply migrations
pnpm admin:create-org --slug <slug>   # Create empty orgs row. Run once per new church before bootstrap. Idempotent.
pnpm bootstrap --slug <slug>          # Seed 5 placeholder users (e.g. <slug>su@<domain>), 10 posts, 6 comments INTO an existing org. Email domain comes from BOOTSTRAP_EMAIL_DOMAIN env (default: example.com) or --domain. Random per-user passwords for cloud (printed at end of run); hardcoded prayer-dev-local for local dev. Refuses non-localhost DATABASE_URL by default; set BOOTSTRAP_ALLOW_REMOTE=1 for cloud-tenant onboarding.
pnpm dev                # api :3001 + web :5173
pnpm dev:remote         # web only, proxied to a remote API (set PROD_API_URL=https://… first)
pnpm test               # all workspaces
pnpm build              # tsc -b across refs (what CI runs)
pnpm typecheck
pnpm lint
pnpm format             # prettier --write .
pnpm format:check       # prettier --check . (what the pre-push hook runs)
```

## Dev modes

Three first-class local-dev modes:

- **Mode A — Full local Docker:** `docker compose up && pnpm bootstrap`. All four containers; no external services.
- **Mode B — Local web + remote API:** `PROD_API_URL=https://api.your-instance.example.com pnpm dev:remote`. Web runs natively against a deployed remote API.
- **Mode C — Native local:** `docker compose up -d postgres gotrue && pnpm dev`. postgres + gotrue in containers; api + web run natively for fastest iteration. Run `pnpm bootstrap` once to seed sample data.

## Worktree bootstrap

After `git worktree add`, before running tests:

```bash
cp ../../.env .env                                          # TEST_DATABASE_URL + others required
cp ../../apps/web/.env.local apps/web/.env.local           # required for web test mocks (VITE_API_URL dummy)
nvm exec 24 pnpm install                                    # MUST be Node 24 — otherwise rolldown native binding fails at test/build time (see Known rough edges)
nvm exec 24 pnpm --filter @prayer/db --filter @prayer/shared build   # project-ref artifacts required for api/web tests
```

**Pass an absolute path to `git worktree add`** — the target is resolved relative to CWD, not the repo root. Running it from inside another worktree silently creates a nested worktree (e.g. `…/.claude/worktrees/outer/.claude/worktrees/inner`). Always: `git worktree add -b <branch> /Users/…/prayer/.claude/worktrees/<name> origin/main`.

## Conventions

- **IDs:** UUIDv7 (sortable, chronological). Use `newId()` from `@prayer/db`.
- **Timestamps:** `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- **Migrations:** `node-pg-migrate` tracks applied migrations by filename only. Editing a migration file after it has run against any long-lived DB (a deployed staging instance, shared CI DB, personal DB you keep around) has **no effect** there — only a newly-numbered migration is picked up. Edit in place only when every DB that runs your code is routinely dropped and re-migrated (the test harness does this via `test/global-setup.ts`). For anything else, add a new migration. Each file has both `-- Up Migration` and `-- Down Migration` sections.
- **Kysely columns:** Read-only generated columns use `ColumnType<T, never, never>`. DB defaults use `Generated<T>`.
- **Tests isolate via schema reset:** `apps/api/test/global-setup.ts` drops + recreates `public` and reruns all migrations before the suite. `packages/db/test/global-setup.ts` does the same for db-package tests — add new integration tests directly without per-file `beforeAll` setup.
- **Bootstrap / seed scripts bypass the service layer.** `packages/db/src/bootstrap.ts` and `apps/api/test/helpers/seed.ts` write directly via Kysely. Service-layer functions write to the `events` outbox in the same transaction, which would trigger notification builders, count recomputers, and feed-snapshot updates for fixture data. Don't "fix" the direct-insert pattern by routing through services.
- **Bootstrap user emails are slug-derived.** `pnpm bootstrap --slug X` creates `Xsu@<domain>`, `Xmod1@<domain>`, `Xmod2@<domain>`, `Xmem1@<domain>`, `Xmem2@<domain>` (domain from `BOOTSTRAP_EMAIL_DOMAIN`, default `example.com`). Two churches in the same DB never collide on email. Display names stay slug-agnostic (`Super User`, `Moderator One`, etc.) so a future "rename placeholder users" tool doesn't reveal the church the placeholder originally belonged to.
- **Roles:** `member` | `moderator` | `super_user`. API routes gate with `requireAuth` + `requireMember/Moderator/SuperUser`.
- **Events outbox:** Every post mutation writes a row to `events` in the **same transaction** as the data write (via `writePostEvent` in `apps/api/src/services/events.ts`). Consumed by `services/event-worker.ts` (LISTEN/NOTIFY) which dispatches notification builders, count recomputers, flag-auto-hide, and the feed snapshot holder.
- **Feed reactions:** `GET /feed` batch-fetches the per-emoji reaction map for each page of posts (one extra query, same pattern as the `prayed` flag). Each `FeedPost` includes `reactions: Record<string, {count, mine}>` — don't assume it's only on the post-detail endpoint.
- **Pagination response keys:** mod-area endpoints (`moderation.ts`, `notifications.ts`, `mod-followup.ts`) return `next_cursor` (snake_case). Only `services/feed.ts` uses `nextCursor`. When adding a new mod/admin endpoint, match the snake_case neighbors.
- **`exactOptionalPropertyTypes: true`** in `tsconfig.base.json` → passing `{ foo: value | undefined }` fails type-check. For optional fields, spread conditionally: `...(value !== undefined ? { foo: value } : {})`.
- **Draft → published is DELETE+INSERT, not UPDATE-in-place.** `services/posts.ts#publishOwnDraft` removes the draft row and inserts a fresh published row in the same transaction. This refreshes both `id` (UUIDv7) and `created_at` to the publish moment, so feed ordering and "X ago" displays reflect when users actually published rather than when they first opened compose. If you edit this code path, preserve the DELETE+INSERT shape — UPDATE-in-place reintroduces a stale-timestamp bug fixed in #49.
- **Post images are uploaded immediately, attached later.** `post_images.post_id` is nullable: NULL means "uploaded, not attached." `publishOwnDraft` must NULL out `post_id` before its DELETE and re-point after its INSERT — the FK is `ON DELETE CASCADE`, so skipping that step silently destroys every image at publish. Unattached rows older than 24h are reaped by `services/image-reaper-job.ts`.
- **The `post-images` bucket is private.** Never build a public URL for it. Reads go through `storage.presignGet` (15-minute TTL) behind the normal membership checks. Only `avatars` and the org logo are public.
- **Images are frozen at publish.** The one-hour edit window changes body text only. `deleteOwnPostImage` refuses any image whose post is not a draft.

## Where to look

- Generic self-hosting guide: `docs/self-hosting.md`.
- Per-app guidance: `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`.
- **Multi-tenant model:** every request's hostname (`<slug>.<your-domain>`) resolves to an org via `apps/api/src/middleware/org-context.ts`; routes scope by `req.user.orgId`. Onboarding a new church: `pnpm admin:create-org --slug X && pnpm bootstrap --slug X`.
- **Admin surface:** `/admin/church` (web) is super_user-only — list/remove members, rename church, promote/demote with cap + floor. Backed by `apps/api/src/routes/admin-church.ts`.

## Branch and PR workflow

- **Never push directly to `main`.** All changes must go through a pull request. A Claude hook blocks any `git push` that targets `main` directly; Husky blocks the same at the git level.
- Create a worktree + feature branch, do the work, open a PR, merge via GitHub.
- **Cleaning a branch after sibling PRs merge:** `git rebase --onto origin/main <last-already-merged-commit> HEAD` replays only the commits above that SHA onto current main — no interactive rebase needed.
- **After a PR squash-merges, don't push to the same branch name again.** The squash-merge replaces all your branch's commits with one new commit on `main`. If you later push to the original branch (e.g. for follow-up work on that local branch), git re-creates it on the remote with the OLD individual commits, which then look like N unmerged changes against main. Recovery: `git checkout -b docs/follow-up origin/main && git cherry-pick <new-commit>` then `git push origin --delete <stale-branch>`.
- **Squash-merge can miss the last-pushed commit.** If you push while a maintainer is clicking "Squash and merge," the squash may not include the latest commit. After merge, `git show <squash>` against the file you pushed last to verify, and open a follow-up PR if it slipped through.
- **A long-lived branch whose feature shipped via another PR rebases to mostly no-ops.** `git rebase origin/main` prints `dropping <sha> ... patch contents already upstream` for each commit whose patch is already merged via a different path. After rebase, run `git log --oneline origin/main..HEAD` AND `git diff --stat origin/main` — the remaining commits may net to ~zero. Worth catching before adding new commits on top, otherwise the PR description misleads reviewers.
- **`gh pr view N --json commits --jq '.commits[-1]'` is unreliable** — the array can include base-update merge commits not on your branch. For the authoritative head SHA, use `git ls-remote origin <branch>`.

## Pre-push hook

Husky installs a `pre-push` hook (`.husky/pre-push`) that runs `pnpm format:check` and `pnpm lint` on every `git push`. Both checks must pass or the push is aborted.

- **If you see the hook run on every push, it's working.** `pnpm install` enables it via the `prepare` script.
- **Before pushing, always run `pnpm format && pnpm lint` locally** — the hook is a safety net, not a substitute for running these yourself. Fixing formatting issues after writing the commit means amending or stacking a fixup commit.
- Use `git push --no-verify` to bypass only when you explicitly know why (e.g., pushing a WIP branch that's not going to CI yet).
- **`pnpm format:check` scans gitignored files.** A scratch directory inside the repo (agent workspace, scratch notes) fails the check and blocks the push even though it will never be committed. Keep scratch outside the repo, or delete it before pushing.
- **The pre-push `git rebase origin/main` can strand a worktree mid-rebase.** On a conflict (typically `pnpm-lock.yaml` + `apps/*/package.json` after a dependency bump lands on main) the push aborts and the worktree sits in `interactive rebase in progress`. Recover with `git rebase --abort` — `ORIG_HEAD` is your pre-rebase tip, so nothing is lost. For the lockfile, resolve the manifests by hand then `git checkout origin/main -- pnpm-lock.yaml && nvm exec 24 pnpm install --lockfile-only` instead of hand-merging the lock.

Claude Code also runs hooks (`.claude/settings.json`): `pnpm lint` before every `git commit`, and `git rebase origin/main` + a main-branch guard before every `git push`.

- The main-branch guard prints `PreToolUse:Bash hook stopped continuation: Direct pushes to main are not allowed` after every push that targets `main`. **This is informational — the push itself still goes through.** Real blocks come from GitHub's branch protection ruleset, which surfaces as `remote rejected ... push declined due to repository rule violations`. Don't repeat-attempt a push because of the hook warning.

## Known rough edges

- `pnpm test` runs Vitest which is structurally permissive for types. `pnpm build` (which CI runs) invokes `tsc -b` against the full project references and catches missing fields on DTO fixtures. **Run `pnpm --filter @prayer/web build` locally after changing any shared type before pushing** — otherwise CI fails on a typecheck gap that Vitest happily ignored.
- `pnpm db:migrate:test` script uses `cross-env DATABASE_URL=$TEST_DATABASE_URL …` which expands the shell variable before `.env` loads → DATABASE_URL ends up empty. Tests do not depend on this script (they go through `migrate()` from `@prayer/db` programmatically), but the script itself is broken.
- `pnpm db:up` only starts Postgres (legacy). For local dev with GoTrue (current default), use `docker compose up -d postgres gotrue` (Mode C) or `docker compose up` (Mode A) per the Dev modes section. The bare `pnpm db:up` script is kept for backward compat but produces an incomplete local stack.
- **`pnpm dev` against an aged local DB throws `orgContext: multiple orgs in DB`.** The orgContext middleware refuses to guess when localhost has more than one org row (the dev convention is one-org-per-localhost). After running the test suite or playing with cell-onboarding, you'll have stale orgs. Delete them with `psql "$DATABASE_URL" -c "DELETE FROM orgs WHERE slug NOT IN ('hope');"` (cascade also clears `user_orgs`, `posts`, `comments`, `events`), or set an explicit `Host` header on every request.
- **Native `pnpm dev` port collisions.** Ports 3001 (api) and 5173 (web) can be held by either (a) the docker stack's prayer-api/prayer-web containers — `docker stop prayer-api prayer-web` (keep postgres + gotrue running); the containers serve images built from `main`, useless for branch testing — or (b) a `pnpm dev` from another worktree — `lsof -iTCP:3001 -sTCP:LISTEN -nP` shows the cwd in the process path; `kill <pid>`. Always `lsof` first when a fresh `pnpm dev` exits silently.
- **Don't pipe `pnpm dev` (or any `pnpm -r --parallel` script) through `head`/`tail`/etc. when running in the background.** SIGPIPE from the truncating filter kills pnpm, which kills api + web. Either let it stream raw to a log file, or `tail -f` the output file separately. Same applies to `docker compose up` without `-d`.
- **Node 22.12+ required for web tests.** `engines.node: ">=24"` is enforced for prod parity, but the load-bearing reason is `pnpm --filter @prayer/web test` — jsdom 29 pulls `html-encoding-sniffer@6` which `require()`s an ESM `@exodus/bytes`. Node 22.12 added builtin `require(esm)`; on Node 20.x the web suite fails with a cryptic `ERR_REQUIRE_ESM` at fork-worker start. CI runs Node 24 so it's fine there; local devs on Node 20 should `nvm use 24` before running web tests.
- **Typed `sql<T>` template fragments break against `Generated<Timestamp>` columns.** A `where('posts.created_at', '<', sql<Date>...)` clause raises TS2345 in `pnpm build` (Vitest misses it — `RawBuilder<Date>` is not assignable to a `Generated<Timestamp>` operand). Workarounds: (a) compute the cutoff in JS with `new Date(Date.now() - ms)` and pass the Date directly, or (b) wrap the column side in an untyped `sql` fragment so Kysely's inferred column type is bypassed. Pattern (a) is in `services/mod-followup.ts`.
- **Raw-SQL seed data needs lexically-ordered UUIDv7-shaped IDs for inline-update ordering.** `services/feed.ts` orders child updates by `posts.id ASC` (chronological under UUIDv7), and `PostCard.slice(-3)` picks the 3 most recent from the tail. `gen_random_uuid()` returns UUIDv4 → random order → the wrong 3 updates show inline. When seeding via psql (not via `insertPost`, which uses `newId()`), use IDs like `'019eff00-0000-7000-8000-000000000001'`, `'…000000000002'`, etc. — they sort lexically in the order you want.
- **`pnpm build` dies with `MODULE_NOT_FOUND` in rolldown when pnpm is bound to ≠ Node 24.** Vite 8 ships Node-version-specific native bindings; `nvm use 24 && pnpm build` doesn't help if pnpm itself was installed under another Node version (check with `pnpm exec node --version`). Use `nvm exec 24 pnpm <cmd>` to force pnpm's child processes onto Node 24, or install pnpm under Node 24 with `nvm use 24 && npm i -g pnpm@9`.
- **Fresh worktrees need `nvm exec 24 pnpm install`, not `nvm use 24 && pnpm install`.** Same root cause as the build issue above — if pnpm is bound to an older Node, the install skips `@rolldown/binding-darwin-arm64` and vitest startup later throws `MODULE_NOT_FOUND`. Always `nvm exec 24 pnpm install` on first worktree setup.
- **Sibling worktrees share the local `prayer_test` DB.** If another worktree is running `pnpm test`, your run will see cascading FK-violation failures (different error counts each rerun). Wait for the other run to finish — don't "fix" `vitest.config.ts`. Identify the racing process via `ps aux | grep vitest | grep worktrees`.
