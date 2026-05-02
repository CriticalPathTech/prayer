# Self-Hosting

Generic guide for running the Prayer OSS Docker stack on any host. No cloud dependencies — see the project's `README.md` for the laptop-quickstart, this doc for slightly more depth.

## What you need

- Docker (Desktop or Engine)
- `pnpm` (only for the bootstrap step that seeds initial users; can be skipped if you'll create users via the web signup flow)
- A host that can run Docker Compose: a laptop, a VPS, a homelab box, anything

## Quickstart (Mode A — everything in containers)

```bash
git clone https://github.com/CriticalPathTech/prayer.git
cd prayer
docker compose up -d --build                  # build + start all containers
pnpm install                                  # local node_modules for the bootstrap CLI
pnpm admin:create-org --slug hope             # create the org (default slug)
pnpm bootstrap --slug hope                    # seed 5 demo users + 10 sample posts + 6 comments
```

Open <http://localhost:5173> and sign in as `hopesu@example.com` with password `prayer-dev-local`.

`pnpm bootstrap` is idempotent — re-running it doesn't duplicate data and doesn't reset passwords.

## Other dev modes

### Mode A-prebuilt — pull api+web from GHCR instead of building

Skip the local Docker build by using the multi-arch images CI publishes from `main`:

```bash
docker compose -f docker-compose.yml -f docker-compose.images.yml pull
docker compose -f docker-compose.yml -f docker-compose.images.yml up -d
pnpm install
pnpm bootstrap
```

Pin to a specific version (recommended for production self-hosting) instead of the moving `:main` tag:

```bash
PRAYER_TAG=0.5.1 docker compose \
  -f docker-compose.yml -f docker-compose.images.yml up -d
```

### Mode B — local web against a remote API

```bash
PROD_API_URL=https://your-api.example.com pnpm dev:remote
```

### Mode C — native local for fastest iteration

```bash
docker compose up -d postgres gotrue   # persistent services in containers
pnpm install
pnpm bootstrap                         # seed once
pnpm dev                               # api :3001 + web :5173 native
```

## Stack components

| Service        | Port        | What it is                                                                                                                 |
| -------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `postgres`     | 5432        | App data (`public.*`) + GoTrue's auth (`auth.*`)                                                                           |
| `gotrue`       | (internal)  | Self-hosted Supabase Auth — issues JWTs, no email needed                                                                   |
| `gotrue-proxy` | 9999        | Tiny nginx in front of GoTrue: strips `/auth/v1` prefix, fixes CORS                                                        |
| `minio`        | 9000 / 9001 | S3-compatible avatar storage. Console at <http://localhost:9001>, dev creds `prayer-dev-local` / `prayer-dev-local-secret` |
| `api`          | 3001        | Express + Kysely backend (`/healthz` for a quick check)                                                                    |
| `web`          | 5173        | Vite + React frontend, served by nginx in the image                                                                        |

## Env vars

See `.env.example` at the repo root for the full reference. Sectioned by workflow (api server, bootstrap, storage, tests, web). Copy to `.env` and adjust hostnames or storage credentials if you're not running locally.

The renamed `AUTH_*` and `VITE_AUTH_*` keys (since v0.5.0) are vendor-neutral — they describe what the variable does, not which provider you're pointing at. Local dev points them at the bundled GoTrue + gotrue-proxy. Production self-hosting points them at whatever auth provider you choose (hosted Supabase, your own GoTrue, an OIDC gateway, etc.).

## Upgrading between releases

```bash
git fetch
git checkout v0.X.Y
docker compose down
docker compose -f docker-compose.yml -f docker-compose.images.yml pull
docker compose -f docker-compose.yml -f docker-compose.images.yml up -d
```

Migrations run automatically when the api container boots. Postgres data persists in the named volume `prayer_pg_data`; MinIO data persists in `prayer_minio_data`.

## Common operations

```bash
docker compose down               # stop everything (data preserved)
docker compose down -v            # stop and wipe all data (postgres + MinIO)
docker compose logs -f api        # tail api logs
docker compose ps                 # show health of each service
```

## Notes for production self-hosting

- **Replace the dev RS256 GoTrue keypair** in `docker/gotrue-jwt/` with your own. Re-mint `VITE_AUTH_ANON_KEY` and `AUTH_ADMIN_KEY` in `docker-compose.yml` accordingly. Without this, anyone who reads the public repo could forge a session.
- **Replace the dev S3 / MinIO credentials** with your own in `docker-compose.yml` and `.env`.
- **Front the stack with TLS** — Caddy, nginx, Cloudflare Tunnel, your choice. Required for browser auth to work cleanly.
- **Back up the postgres volume regularly.** `docker run --rm -v prayer_pg_data:/data -v $(pwd):/backup ubuntu tar -czf /backup/pg-backup-$(date +%F).tar.gz /data` is one option.
- **Pin to a SemVer release tag** (e.g., `:0.5.1`) rather than `:main` or `:latest` — avoids surprise breakage when CI publishes a new `:main` image.
