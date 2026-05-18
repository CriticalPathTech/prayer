# Split PR #30: React 19 + React Router 7

**Status:** Approved (design)
**Date:** 2026-05-17
**Replaces:** PR #30 (Dependabot grouped bump bundling react/react-dom/@types/react/@types/react-dom + react-router-dom)

## Why split

PR #30 bundles two majors with independent migration shapes into one Dependabot lockfile bump:

- **react 18 → 19**: refs as props, ref-forwarding API change, `use()` hook, stricter `@types/react` 19, several removed legacy APIs.
- **react-router-dom 6 → 7**: data-router rewrite is the headline story; for a declarative-routes codebase like ours, the practical change is "v6 `future` flags become defaults."

Worse, PR #30 contains zero code adaptations — only `apps/web/package.json` (+5/-5) and `pnpm-lock.yaml` (+74/-74). Whoever merges it inherits all the migration work in a single landing. Splitting gives each major its own diff, its own CI gate, and a clean revert boundary.

## Codebase audit (informs scope)

- `apps/web/src` has **no** `ReactDOM.render`, no `forwardRef`, no `defaultProps`, no `UNSAFE_*`, no string refs, no `propTypes`. React 19's hardest removals don't apply to us.
- React Router usage is broad: `<Routes>`/`<Route>`/`useNavigate` across 30+ files; `MemoryRouter` wrappers across all view-layer tests. No `createBrowserRouter`, no loaders, no actions today.
- Current branch `chore/vite7-vitest4` is mid-rebase with a `pnpm-lock.yaml` conflict. Out of scope; new PRs go through fresh worktrees off `main`.

## Decisions (from brainstorm)

| Question          | Decision                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| React 19 scope    | **Compat-only.** Bump versions, fix type/runtime regressions, do not adopt new React 19 patterns.             |
| RR 7 router style | **Stay declarative.** Keep `<BrowserRouter><Routes><Route>…`. v7 still supports it. No data-router migration. |
| PR #30 lifecycle  | **Close after PR A opens**, with a "superseded by #A and #B" comment.                                         |

## Plan

### PR A — `chore/react19` (off `main`)

**Scope:**

1. Bump in `apps/web/package.json`:
   - `react`: `^18.3.0` → `^19.2.0`
   - `react-dom`: `^18.3.0` → `^19.2.0`
   - `@types/react`: `^18.3.0` → `^19.2.0`
   - `@types/react-dom`: `^18.3.0` → `^19.2.0`
2. Regenerate `pnpm-lock.yaml`.
3. Fix typecheck regressions from `@types/react` 19. Expected hotspots:
   - Components that take `children` without typing it (now must be explicit `ReactNode`).
   - JSX `Element` namespace tightening.
   - `Ref<T>` no longer callable in some shapes.
4. Audit the two areas flagged in the brainstorm:
   - **Auth context** (whatever provider wraps `<App />`) — ensure context value type still resolves.
   - **Suspense boundaries** — React 19 tightens Suspense fallback behavior on transitions; verify any deliberate boundaries still render expected fallbacks.
5. No behavior changes, no new React 19 idioms. If a forwardRef refactor is tempting, defer.

**Verification gate:**

- `pnpm --filter @prayer/web build` (catches the tsc/vitest gap noted in CLAUDE.md).
- `pnpm test` across all workspaces.
- `pnpm lint` and `pnpm format:check`.
- Manual smoke: dev server, login flow, feed, compose, mod queue. Mobile + desktop view.

**Risk:** Low–medium. Most of the surface is type tightening; behavior changes in React 19 are mostly opt-in.

### PR B — `chore/react-router-v7` (off `main`, rebased on merged PR A)

**Scope:**

1. Bump `react-router-dom`: `^6.26.0` → `^7.15.0` in `apps/web/package.json`.
2. Regenerate `pnpm-lock.yaml`.
3. Apply v7 declarative-routes adaptations:
   - Drop any `future: { v7_* }` flags from `<BrowserRouter>` — defaults now.
   - Audit `NavLink` styling/className callbacks for `isPending` / `isTransitioning` semantics changes.
   - Verify `<Routes>` relative-path resolution still works as expected.
4. Verify `MemoryRouter` test wrappers compile and run under v7 (no API removals there for our usage).
5. No data-router migration. No `createBrowserRouter`. No loaders/actions.

**Verification gate:** Same as PR A.

**Risk:** Medium. v7 has more behavioral changes than React 19 even in declarative-mode, and the wrapper count means many test files exercise the dependency.

### PR #30 close-out

Once PR A is open and has CI green:

- Comment on #30: "Superseded by #A (React 19) and #B (react-router-dom 7) — split per migration boundary."
- Close PR #30.
- If Dependabot re-opens the grouped bump on its next run, close again — by then PR A is in flight and there's nothing for the grouped bump to do.

## Out of scope

- Vite 7 / Vitest 4 bump (active on `chore/vite7-vitest4` — separate work).
- Adopting React 19 features (`use()`, Actions, `useOptimistic`, refs-as-props refactor).
- Migrating to data-router (loaders, actions, `createBrowserRouter`).
- Any cross-cutting refactor of auth/suspense beyond what compat requires.

## Worktree hygiene

Each PR is implemented in its own `git worktree`:

```
git worktree add ../prayer.react19 -b chore/react19 origin/main
git worktree add ../prayer.rr7    -b chore/react-router-v7 origin/main
```

(After PR A merges, recreate the RR7 worktree off the updated `main`.)

The active rebase on `chore/vite7-vitest4` in `/Users/yiyangli/funcave/prayer/` is left untouched.

Per CLAUDE.md worktree bootstrap: in each new worktree, `cp ../../.env .env && cp ../../apps/web/.env.local apps/web/.env.local && pnpm install && pnpm --filter @prayer/db --filter @prayer/shared build` before running tests.
