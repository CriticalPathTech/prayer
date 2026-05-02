# Contributing to Prayer

Thanks for considering a contribution. This is a small, opinionated codebase
for a private community use case (church prayer requests). The bar for merging
changes is "would the maintainers want to maintain this for years?"

## Quick start

1. `pnpm install` (Node 20+, see `.nvmrc`).
2. `cp .env.example .env` and fill in the placeholders.
3. `docker compose up -d postgres gotrue` to start dependencies.
4. `pnpm dev` to run api (`:3001`) + web (`:5173`) together.
5. `pnpm bootstrap --slug example` once to seed sample users + posts.

The full setup including production deployment is documented in
[`docs/self-hosting.md`](docs/self-hosting.md).

## Before opening a PR

```bash
pnpm format          # auto-fix formatting
pnpm lint            # eslint
pnpm test            # all workspace tests
pnpm build           # tsc -b across project refs (CI runs this)
```

The pre-push hook will block your push if `pnpm format:check` or `pnpm lint`
fails — `pnpm format && pnpm lint` locally first.

CI runs the same checks plus an end-to-end smoke against a fresh local stack.

## Branch and PR workflow

- **Never push to `main` directly.** GitHub branch protection enforces this.
- Branch off `origin/main`, open a PR, get review, squash-merge.
- Conventional commit prefixes preferred (`feat`, `fix`, `chore`, `docs`,
  `test`, `refactor`).
- Keep PRs focused — one logical change per PR makes review and revert easy.

## Code style notes

- TypeScript with `strict` and `noUncheckedIndexedAccess` enabled.
- ESM + NodeNext: relative imports in `apps/api`, `packages/db`, `packages/shared`
  use `.js` suffixes (the source is `.ts`). The web app is the exception —
  Vite's bundler resolution doesn't use suffixes.
- Prefer Kysely query builder; raw `sql\`\`` is fine when needed but always
  parameterize values.
- Throw typed errors from `apps/api/src/middleware/error.ts`; the central
  error handler maps them to JSON. Don't `res.status(N).json(...)` ad hoc.
- Tests live next to source (`*.test.ts` / `*.test.tsx`).

The per-app `CLAUDE.md` files (root, `apps/api`, `apps/web`) are written for
agentic assistants but make a useful overview for humans too — they document
the non-obvious patterns and gotchas.

## Reporting bugs / requesting features

Use the issue templates in `.github/ISSUE_TEMPLATE/`. For anything
security-sensitive, see [SECURITY.md](SECURITY.md) — please don't file a
public issue.

## Scope

This codebase is a single-tenant-per-host prayer-request app for church
communities. Features that would change that fundamental shape (e.g.
public/discoverable feeds, multi-tenancy mode where one user belongs to many
churches by default, replacing Postgres) are unlikely to be merged without
prior discussion in an issue.

## License

By contributing, you agree your contribution is licensed under the same terms
as the rest of the project. See [LICENSE](LICENSE).
