# apps/web — Claude Guide

Vite + React 18 + TypeScript + Tailwind. Supabase Auth for sign-in; all data reads go to the api via `apiFetch`.

## Layout

```
src/
  main.tsx                Entry — renders <App/> inside StrictMode
  App.tsx                 AuthProvider → BrowserRouter → Routes
  index.css / design-tokens.css / animations.css
  test-setup.ts           Vitest setup — imports @testing-library/jest-dom/vitest
  components/
    Layout.tsx            Header (nav + NotificationBell + avatar menu) + skip-link + <Outlet/>
    ProtectedRoute.tsx    Loading / redirect-to-/login / render children
    PostCard.tsx          Feed row — anonymity mask, expiring-soon pill, FlagButton, Reactions
    UpdatePostItem.tsx    Indented update w/ "Answered prayer" badge
    SortTabs.tsx          Newest | Updated | Popular tablist
    ExpiryPicker.tsx      1–365 day numeric input; emits ISO string
    FlagButton.tsx, FlagModal.tsx, FlagCountPill.tsx
    HiddenBanner.tsx      Member-facing copy + moderatorView variant ("Hidden by Alice" / "Auto-hidden (2 flags)")
    HideTombstone.tsx     Dashed gray box for hidden posts to non-privileged viewers
    InviteModal.tsx
    NotificationBell.tsx, NotificationPanel.tsx, NotificationList.tsx
    CommentThread.tsx, CommentItem.tsx, CommentForm.tsx
    ModQueue*.tsx         Moderation queue rows
    AvatarCropDialog.tsx  Profile-photo crop+zoom+rotate dialog (react-easy-crop → canvas → WebP → POST /me/avatar)
    CheckEmailPanel.tsx   Shared "check your email" panel for signup + password-reset flows
    CopyCode.tsx          Copy-to-clipboard widget for invite codes
    ModTabs.tsx           Queue | Invites tabs under /mod
    NewActivityBanner.tsx "New activity" banner on feed when snapshotId advances
    PrayButton.tsx        Prayer toggle (optimistic, debounced)
    ui/                   Avatar, Button, Field, Icon, Pill, Reactions (+ tests co-located)
  hooks/
    useAuth.tsx           AuthProvider context + useAuth hook
                          → { session, me: Me | null, loading, needsOnboarding, refreshMe, signOut }
                          where `me` is the app user (users.id), fetched from /me on session
                          `me` fields: { id, email, displayName, avatarUrl, role }
    useFeed.ts            Feed state: sort + cursor; calls GET /feed
    usePost.ts            Single post + updates: GET /posts/:id, 404 → notFound
    usePostComments.ts, useReactions.ts, useFlagAction.ts, usePrayer.ts
    useNotifications.ts, useMyInvites.ts, useModQueue.ts
    useDraft.ts           Single auto-saving draft: GET /me/draft on mount, debounced PUT, flush() before publish
  lib/
    supabase.ts           Supabase client singleton (explicit persistSession + autoRefreshToken)
    api.ts                apiFetch<T>(path) — attaches Bearer from supabase.auth.getSession()
    gravatar.ts           md5(email) → https://www.gravatar.com/avatar/... (used by 3-tier Avatar fallback)
    authErrorCopy.ts      Maps API/Supabase error codes to friendly user-facing text
  pages/
    LoginPage, SignupCodePage, SignupAccountPage, CheckEmailPage, AuthCallbackPage,
    ForgotPasswordPage, ResetPasswordPage,
    FeedPage, ComposePage, PostDetailPage,
    ProfilePage, SecurityPage, MyArchivePage, MyInvitesPage,
    ModQueuePage, ModInvitesPage, NotFoundPage
test/
  mobile/                 Playwright specs (smoke.spec.ts + axe.spec.ts) — iPhone SE + iPhone 12 Pro
playwright.config.ts
```

## Conventions

- **Module resolution:** Vite uses `"moduleResolution": "Bundler"`, so relative imports do NOT use `.js` extensions. This differs from the API workspace.
- **Env vars:** Vite exposes only `VITE_*` vars. Required at build/dev time:
  - `VITE_AUTH_URL`
  - `VITE_AUTH_ANON_KEY`
  - `VITE_API_URL` (e.g., `http://localhost:3001`)
- **Secrets:** `.env.local` is gitignored — use it for local dev and CI builds needing dummy values. Never commit real keys.
- **Routing:** top-level structure is `AuthProvider → BrowserRouter → Routes`. Authed routes are wrapped in `<ProtectedRoute><Layout/></ProtectedRoute>` as a parent route; children render via `<Outlet/>`.
- **Auth access:** always use `useAuth()`. For author gates (`post.author_id === me.id`), use `me.id` — it's the app user id from `/me`. Never compare `session.user.id` (Supabase auth UUID) against `author_id` — they are different IDs.
- **API access:** always use `apiFetch<T>('/path')` — it handles the Bearer token, JSON parsing, and throws `ApiError` on non-2xx. Never call `fetch` directly for API routes.
- **JSX return type:** components use `: JSX.Element`. If TS can't resolve `JSX`, add `import type { JSX } from 'react'` at the top.

## Styling

- Tailwind utility classes; no CSS modules or CSS-in-JS.
- Container widths: content inside `max-w-4xl mx-auto px-4`.
- Keep components in a single file unless they become reusable primitives.

## Testing

- Vitest with `environment: 'jsdom'`, `@testing-library/react`, `@testing-library/user-event`.
- `vitest.config.ts` sets `globals: true` and includes `src/test-setup.ts` as a setup file. That setup file imports `@testing-library/jest-dom/vitest`, which is why matchers like `toBeInTheDocument()` are available without per-file imports.
- Test files live next to source (`*.test.tsx`).
- Mock `../hooks/useAuth` with `vi.mock` + a top-level `useAuthMock = vi.fn()` so tests can drive `{ session, loading }` independently. Wrap route-aware components in `<MemoryRouter>`.

## Commands

```
pnpm --filter @prayer/web dev
pnpm dev:remote          # web only against a remote API — run from repo root with PROD_API_URL=https://…
pnpm --filter @prayer/web test
pnpm --filter @prayer/web typecheck
pnpm --filter @prayer/web build
pnpm --filter @prayer/web test:mobile    # Playwright — needs a running dev server on :5173
```

## Gotchas

- **`pnpm test` ≠ `pnpm build`.** Vitest is structurally permissive for types; `tsc -b` (which `pnpm build` runs and CI enforces) checks the full project references. Adding a field to `FeedPost` / `PostDto` means updating every test fixture that constructs one (`PostCard.test.tsx`, `FeedPage.test.tsx`, `PostDetailPage.test.tsx`). **Run `pnpm --filter @prayer/web build` locally after any shared-type change before pushing.**
- **Design tokens:** components use CSS custom properties from `src/design-tokens.css` — `var(--fg-1/2/3/4)`, `var(--bg-page/raised)`, `var(--border-soft)`, `var(--focus-ring)`, `shadow-warm-sm/md`, and the parchment / warm / vesper palette via Tailwind. Match the existing component style (see `Layout.tsx` for a reference across all tokens) rather than inventing new colors.
- **Icons** come from `src/assets/icons/*.svg?react` (vite-plugin-svgr) and are registered in `components/ui/Icon.tsx`. Add new icons there; don't inline SVG in components.
- `lib/supabase.ts` throws at module evaluation if `VITE_AUTH_URL` / `VITE_AUTH_ANON_KEY` are missing. A Vite build with empty env vars will abort — set dummy values in `.env.local` or inline the build command for CI.
- `tsconfig.node.json` is composite (`outDir: dist-node/`, which is gitignored). Don't switch it to `noEmit: true` — project references require an emit target.
- React Router v6 future-flag warnings about `v7_startTransition` / `v7_relativeSplatPath` are expected and harmless; opt in when convenient.
- `vite.config.ts` sets `envDir` to the repo root so `VITE_*` vars in root `.env` reach the Vite dev server (otherwise Vite looks at `apps/web/.env` and misses them).
- Test mocks that do `vi.importActual('../lib/api')` cause `lib/api.ts` to evaluate at module init, which throws if `VITE_API_URL` is unset. `.env.local` (gitignored) has a dummy value for test runs.
- **Vite `define` cannot override `import.meta.env.*` in dev mode** — Vite's env plugin replaces `import.meta.env` before `define` runs. Use an `enforce: 'pre'` plugin with a literal `code.replace(/import\.meta\.env\.VITE_FOO/g, JSON.stringify(value))` instead (see `vite.config.ts` `remote-api-url` plugin).
- **Vite proxy `changeOrigin: true` rewrites `Host` only, not `Origin`** — production's origin-check middleware still blocks mutations. Strip it explicitly: `proxy.on('proxyReq', req => req.removeHeader('origin'))`.
- **`FeedPost` now includes `reactions: Record<string, {count, mine}>`** — any test fixture constructing a `FeedPost` must include this field (or `reactions: {}`). Same applies when adding new `FeedPost` fields: update `PostCard.test.tsx`, `FeedPage.test.tsx`, `PostDetailPage.test.tsx`, `ComposePage.test.tsx`, and `useDraft.test.tsx`.
