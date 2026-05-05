# Prayer

Private, invite-only prayer-request app for church communities. Source-available
under the Elastic License 2.0 (see [LICENSE](LICENSE)), self-hostable, runs
entirely on your laptop with no external accounts.

## What's inside

- Prayer feed with three sort modes (newest / updated / popular)
- Private one-on-one comment threads (only the author and commenter see them; moderators can peek)
- Six emoji reactions, "I prayed" tally, anonymous posts, expiring requests
- Invite-only signup with seat-capped invite codes
- Mobile-friendly UI, accessible by default

## Quickstart (Docker, ~2 min)

**Prerequisites:** Docker (Desktop or Engine) and `pnpm` (only needed for the bootstrap step). No external accounts required.

```bash
docker compose up -d --build                  # build and start: postgres + gotrue + minio + api + web
pnpm install                                  # local node_modules for the bootstrap CLI
pnpm admin:create-org --slug hope             # create the org (default slug)
pnpm bootstrap --slug hope                    # seed 5 users + 10 sample posts + 6 comments
```

Open <http://localhost:5173> and sign in as `hopesu@example.com` with password `prayer-dev-local`.

`pnpm bootstrap` is idempotent — re-running it never duplicates data and never resets passwords.

### What you just started

| Service    | Port        | What it is                                                                                                                      |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `postgres` | 5432        | App data (`public.*`) + GoTrue's auth (`auth.*`)                                                                                |
| `gotrue`   | 9999        | Self-hosted Supabase Auth — issues JWTs, no email needed                                                                        |
| `minio`    | 9000 / 9001 | S3-compatible avatar storage. Console: <http://localhost:9001> — dev-only creds: `prayer-dev-local` / `prayer-dev-local-secret` |
| `api`      | 3001        | Express + Kysely backend (`/healthz` for a quick check)                                                                         |
| `web`      | 5173        | Vite + React frontend, served by nginx in the image                                                                             |

Health-check the stack:

```bash
docker compose ps                                # all five services healthy
curl -fs http://localhost:3001/healthz | jq      # api
curl -fs http://localhost:9999/.well-known/jwks.json | jq '.keys | length'   # gotrue
curl -fs http://localhost:9000/minio/health/live    # minio
```

## Default users (after `pnpm bootstrap`)

All emails follow the pattern `<slug><role-suffix>@<domain>`. With the default
slug `hope` and default domain `example.com`:

| Email                  | Role         | Password           |
| ---------------------- | ------------ | ------------------ |
| `hopesu@example.com`   | `super_user` | `prayer-dev-local` |
| `hopemod1@example.com` | `moderator`  | `prayer-dev-local` |
| `hopemod2@example.com` | `moderator`  | `prayer-dev-local` |
| `hopemem1@example.com` | `member`     | `prayer-dev-local` |
| `hopemem2@example.com` | `member`     | `prayer-dev-local` |

To use a different slug or domain, pass `--slug <yourchurch>` and set
`BOOTSTRAP_EMAIL_DOMAIN=yourdomain.org` (or pass `--domain`). Two churches in
the same DB will never collide on email because the slug prefixes the local
part.

Sign in as different users to see how moderator vs. member views differ.

## Other dev modes

The Quickstart above is **Mode A** — everything in containers, built locally. Two other workflows exist:

**Mode B — local web against a remote API.** UI changes without running the backend:

```bash
PROD_API_URL=https://api.your-instance.example.com pnpm dev:remote
```

**Mode C — native local for fastest iteration.** Persistent services in containers, api+web run natively with hot reload:

```bash
docker compose up -d postgres gotrue   # persistent services
pnpm install
pnpm bootstrap                         # seed once
pnpm dev                               # api :3001 + web :5173 native
```

## Common tasks

```bash
docker compose down                    # stop everything
docker compose down -v                 # stop and wipe all data
docker compose logs -f api             # tail logs

pnpm test                              # vitest across all workspaces
pnpm build                             # tsc -b across project refs (CI runs this)
pnpm typecheck                         # types only
pnpm lint                              # eslint
pnpm format                            # prettier --write
```

## Stopping and starting fresh

```bash
docker compose down -v                 # wipe data
docker compose up -d --build           # rebuild and start
pnpm bootstrap                         # reseed
```

## Project layout

```
apps/api          Express + Kysely backend
apps/web          Vite + React frontend
packages/db       Kysely schema, migrations, bootstrap script
packages/shared   Zod-validated env parsers shared across api + web
docker/           Compose init scripts + GoTrue JWK fixtures (storage runs in MinIO)
docs/             Self-hosting guide
```

## More

- [`docs/self-hosting.md`](docs/self-hosting.md) — generic deployment guide for the OSS Docker stack
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to set up a dev environment, run tests, open a PR
- [`SECURITY.md`](SECURITY.md) — vulnerability reporting (please don't use the public issue tracker)
- [`CLAUDE.md`](CLAUDE.md) — project guide for Claude Code sessions

## License

[Elastic License 2.0](LICENSE). Source-available, free to self-host and modify.
The license forbids offering this code as a hosted multi-tenant service to
third parties — please reach out if you have a different use case in mind.
