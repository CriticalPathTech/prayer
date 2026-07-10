# Post Extension Implementation

> **Companion to:** `docs/post-extension-specification.md`
> **Branch:** `post-extension`
> **Last updated:** 06-09-2026
> **Status:** ✅ **IMPLEMENTED & VERIFIED.** Full `pnpm build` green; `pnpm lint` + `pnpm format:check` clean; **540/540 API tests** and **652/652 web tests** pass (incl. new extend coverage). See §13 (as-built) and §14 (issues encountered) for what changed versus the plan below.

This document outlines the concrete code changes to implement moderator-driven post extension. It follows the existing **pin** feature end-to-end (`mod-posts-pin.ts` → `post.pinned` event → DTO) as its template, since the shapes are nearly identical.

Sections §1–§12 are the original **plan**. Sections §13–§14 record the **as-built** result and the issues hit during implementation. Where the two differ, §13 wins.

## 0. Locked decisions

| #   | Decision          | Choice                                                                                                                                                                                                                                                           |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Eligible statuses | `published` **and** `archived` — extending an archived prayer **un-archives** it (`status → 'published'`) with a fresh expiry. `hidden` / `pending` / `rejected` / `draft` are **not** extendable (a hidden post has a deliberate moderation state; use unhide). |
| 2   | New expiry        | `now + N days` (extension moment + chosen duration). Never stacks on the old date.                                                                                                                                                                               |
| 3   | Duration choices  | Reuse `ExpiryPicker`: 1 / 3 / 7 / 14 / 30 days.                                                                                                                                                                                                                  |
| 4   | Limits            | None — a moderator may extend an eligible post any number of times.                                                                                                                                                                                              |
| 5   | Audit / mark      | Persist `extended_at` + `extended_by` on the post; surface an "Extended by a moderator" mark in the UI and notify the author.                                                                                                                                    |
| 6   | Who can extend    | `moderator` + `super_user` (the `/mod/*` gate).                                                                                                                                                                                                                  |

**Assumptions I'm making (correct me if wrong):** the notification names the duration but **not** the individual moderator ("A moderator extended your prayer for another 2 weeks"); the author is notified even for anonymous prayers (notifications are private to that user); the mark on the card reads "Extended by a moderator" without naming the moderator to members (the `extended_by` id is projected only for privileged viewers, like `hidden_by`).

---

## 1. Database — migration `0028_post_extension.sql`

Last migration is `0027_pinned_posts.sql`, so the next is **0028** (run `ls packages/db/migrations/` to confirm before writing).

```sql
-- Up Migration
ALTER TABLE posts ADD COLUMN extended_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN extended_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Down Migration
ALTER TABLE posts DROP COLUMN extended_by;
ALTER TABLE posts DROP COLUMN extended_at;
```

Notes:

- `ON DELETE SET NULL` mirrors `0026_moderated_by_set_null.sql` — removing a moderator's user row must not cascade-delete prayers.
- No index needed: `extended_at` is read per-post, never filtered/sorted in a hot query.
- Nullable: only set on first extension. A never-extended post has both `NULL`.

## 2. Schema types — `packages/db/src/schema.ts`

Add to `PostsTable` (both nullable `Date | null` — they are writable, so NOT `Generated<>`):

```ts
export interface PostsTable {
  // …existing…
  pinned_by: string | null;
  extended_at: Date | null;
  extended_by: string | null;
}
```

## 3. Events — `apps/api/src/services/events.ts`

Add `'post.extended'` to `PostEventKind`:

```ts
export type PostEventKind =
  | 'post.update_created'
  | 'post.submitted'
  | 'post.approved'
  | 'post.rejected'
  | 'post.pinned'
  | 'post.unpinned'
  | 'post.extended';
```

Payload (written via the existing `writePostEvent`, no new writer fn needed):

```ts
{
  old_expires_at: string | null,   // ISO, may be null/past
  new_expires_at: string,          // ISO
  duration_days: 1 | 3 | 7 | 14 | 30,
  was_archived: boolean,           // true → this extension un-archived the post
  extended_by: string,             // moderator user id
}
```

## 4. Service — `apps/api/src/services/posts.ts`

### 4a. `extendPost`

New function modeled on the pin route's transaction body. Validation lives here; the route just calls it.

```ts
const EXTEND_CHOICES = [1, 3, 7, 14, 30] as const;
export type ExtendDays = (typeof EXTEND_CHOICES)[number];

export async function extendPost(
  db: Kysely<Database>,
  args: { postId: string; orgId: string; moderatorId: string; durationDays: ExtendDays },
): Promise<
  { kind: 'ok'; row: PostRow } | { kind: 'not_extendable' } // status not in {published, archived}
> {
  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('posts')
      .select(['id', 'status', 'expires_at', 'author_id'])
      .where('id', '=', args.postId)
      .where('org_id', '=', args.orgId)
      .executeTakeFirst();
    if (!existing) throw new NotFoundError('Post not found');
    if (existing.status !== 'published' && existing.status !== 'archived') {
      return { kind: 'not_extendable' as const };
    }

    const now = new Date();
    const wasArchived = existing.status === 'archived';
    const newExpiresAt = new Date(now.getTime() + args.durationDays * 86_400_000);

    await trx
      .updateTable('posts')
      .set({
        status: 'published', // no-op if already published; un-archives if archived
        expires_at: newExpiresAt,
        extended_at: now,
        extended_by: args.moderatorId,
      })
      .where('id', '=', args.postId)
      .where('org_id', '=', args.orgId)
      .execute();

    await writePostEvent(trx, {
      kind: 'post.extended',
      orgId: args.orgId,
      postId: args.postId,
      actorId: args.moderatorId,
      payload: {
        old_expires_at: existing.expires_at ? existing.expires_at.toISOString() : null,
        new_expires_at: newExpiresAt.toISOString(),
        duration_days: args.durationDays,
        was_archived: wasArchived,
        extended_by: args.moderatorId,
      },
    });

    const row = await fetchPostRow(trx, { postId: args.postId, orgId: args.orgId });
    return { kind: 'ok' as const, row };
  });
}
```

Key points:

- **UPDATE-in-place** — `id` / `created_at` / comments / reactions / prayers untouched (NOT the DELETE+INSERT used by `publishOwnDraft`).
- Setting `status: 'published'` unconditionally is the un-archive (decision #1); it's a no-op for an already-published post.
- No cap check (decision #4). If decision #4 ever changes, add the ceiling test here.

### 4b. `PostRow` / `PostDto` / `toPostDto`

`PostRow` (the `fetchPostRow` projection) — add the new columns plus a joined display name for the mark, mirroring the `hidden_by_id` / `hidden_by_display_name` pattern:

```ts
export interface PostRow {
  // …existing…
  extended_at: Date | null;
  extended_by_id?: string | null;
  extended_by_display_name?: string | null;
}
```

`fetchPostRow` already `leftJoin`s for hide attribution — add a `leftJoin` to `users` on `posts.extended_by` and select `extended_at`, `extended_by`, and the joined `display_name`. (Select `posts.extended_at` in the three `.select([...])` projections that read post columns: `fetchPostRow`, the feed query, and the archive query.)

`PostDto` — surface an `ExtendedByRef`, mirroring `HiddenByRef`:

```ts
export interface PostDto {
  // …existing…
  extended_at: string | null;
  extended_by: { id: string; display_name: string } | null; // privileged viewers only
}
```

`toPostDto` mapping:

```ts
// `extended_at` is safe to show to everyone (it's the "Extended by a moderator" date).
// `extended_by` identity is projected only for privileged viewers, like hidden_by.
const showExtendedBy = caller.role === 'moderator' || caller.role === 'super_user';
// …
extended_at: row.extended_at ? row.extended_at.toISOString() : null,
extended_by:
  showExtendedBy && row.extended_by_id && row.extended_by_display_name
    ? { id: row.extended_by_id, display_name: row.extended_by_display_name }
    : null,
```

> Members see `extended_at` (→ "Extended by a moderator on …") but not which moderator; mods/super_users see the name. This matches the spec's privacy posture for `hidden_by`.

## 5. Route — `apps/api/src/routes/mod-posts-extend.ts`

New file, modeled directly on `mod-posts-pin.ts`. (Could also be a third handler inside `mod-posts-pin.ts`, but a separate file keeps the pin router focused.)

```ts
const zExtend = z.object({
  duration_days: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(14), z.literal(30)]),
});

export function modPostsExtendRouter(deps: { db: Kysely<Database> }): Router {
  const router = Router();
  router.post('/mod/posts/:id/extend', async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const parsed = zExtend.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.message);

      const result = await extendPost(deps.db, {
        postId: req.params['id']!,
        orgId: req.user.orgId,
        moderatorId: req.user.id,
        durationDays: parsed.data.duration_days,
      });
      if (result.kind === 'not_extendable') {
        res.status(409).json({ error: 'not_extendable' });
        return;
      }
      res.status(200).json({ post: toPostDto(result.row, { role: req.user.role }, req.user.id) });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
```

Mirrors pin's `409 { error: 'not_published' }` convention for invalid-state (`not_extendable`).

## 6. App wiring — `apps/api/src/app.ts`

Mount alongside the other moderator routers:

```ts
import { modPostsExtendRouter } from './routes/mod-posts-extend.js';
// …
app.use(auth, requireModerator(), modPostsExtendRouter({ db: deps.db }));
```

Register the event handler in the `extraHandlers` map (the notification builder from §7):

```ts
'post.extended': postExtendedBuilder,
```

## 7. Notification builder — `apps/api/src/services/notification-builders/post-extended.ts`

Modeled on `post-rejected.ts` — looks up the author, inserts a notification row. **Skip self-notification** if the moderator is also the author (a mod extending their own prayer shouldn't ping themselves).

```ts
interface ExtendedPayload {
  new_expires_at: string;
  duration_days: number;
  was_archived: boolean;
  extended_by: string;
}

export const postExtendedBuilder: EventHandler = async (event, trx) => {
  const payload = event.payload as ExtendedPayload;
  if (!event.post_id) return;
  const post = await trx
    .selectFrom('posts')
    .select(['author_id'])
    .where('id', '=', event.post_id)
    .where('org_id', '=', event.org_id)
    .executeTakeFirst();
  if (!post) return;
  if (post.author_id === payload.extended_by) return; // don't notify self

  await trx
    .insertInto('notifications')
    .values({
      id: newId(),
      org_id: event.org_id,
      user_id: post.author_id,
      type: 'post.extended',
      payload: {
        post_id: event.post_id,
        duration_days: payload.duration_days,
        new_expires_at: payload.new_expires_at,
        was_archived: payload.was_archived,
      } as never,
    })
    .execute();
};
```

## 8. Web — desktop

### 8a. Shared duration → label helper

The notification copy needs "2 weeks" from `14`. Extract the `ExpiryPicker` label map into a tiny exported helper (`durationLabel(days)`), reused by the notification item and the extend dialog so copy stays consistent.

### 8b. `useExtendPost` hook (`apps/web/src/hooks/useExtendPost.ts`)

`apiFetch` wrapper, same shape as the pin hook:

```ts
async function extend(postId: string, durationDays: number): Promise<PostDto> {
  const { post } = await apiFetch<{ post: PostDto }>(`/mod/posts/${postId}/extend`, {
    method: 'POST',
    body: JSON.stringify({ duration_days: durationDays }),
  });
  return post;
}
```

Return `{ extend, busy, error }`; caller refreshes the post/feed with the returned DTO (optimistic-friendly).

### 8c. Extend dialog

A small modal reusing `ExpiryPicker` (it already renders the 1/3/7/14/30 choices) + a confirm button. Title "Keep this prayer visible for…". On confirm → `useExtendPost.extend` → close + propagate the new DTO via `onChange`.

### 8d. `PostMenu.tsx`

Add an Extend item next to Pin, privileged-only, eligible on **published or archived**:

```ts
const canExtend = isPrivileged && (status === 'published' || status === 'archived') && !!onExtend;
```

- Add `onExtend?: () => void` to `PostMenuProps` and include `canExtend` in `hasAnyItem`.
- Widen the `status` prop type to include `'archived'` (already present) — confirm `'rejected'` isn't needed here.
- New menu button ("Extend…") opens the dialog from 8c. Icon: reuse `refresh` or add a `calendar-plus` to `ui/Icon.tsx`.

### 8e. The "Extended by a moderator" mark

- Add `extended_at` / `extended_by` to the web `PostDto` **and** `FeedPost` types.
- In `PostCard.tsx`, render a small pill/line when `extended_at` is set: "Extended by a moderator · {formatAgo(extended_at)}". For privileged viewers with `extended_by`, optionally name them.
- **Fixture fallout:** adding fields to `FeedPost` / `PostDto` means updating every fixture that constructs one — `PostCard.test.tsx`, `FeedPage.test.tsx`, `PostDetailPage.test.tsx`, `ComposePage.test.tsx`, `useDraft.test.tsx`, and `views/mobile/__fixtures__/feedPost.ts`. Run `pnpm --filter @prayer/web build` after the type change (Vitest won't catch the gaps).

### 8f. `NotificationItem.tsx`

Add a `post.extended` branch (copy uses the duration label):

```tsx
if (notification.type === 'post.extended') {
  const p = notification.payload as unknown as { post_id: string; duration_days: number };
  // → <Link to={`/posts/${p.post_id}`}> "A moderator extended your prayer for another {durationLabel(p.duration_days)}" </Link>
}
```

Also add `'post.extended'` to the `Notification['type']` union in `hooks/useNotifications.ts`.

## 9. Web — mobile (parallel tree)

Mirror 8d–8e in the mobile components — they do **not** reuse the desktop ones:

- `views/mobile/MobilePostCard.tsx` — Extend action in its chevron menu + the "Extended by a moderator" mark (remember Reactions sits at a different render site on mobile, per `apps/web/CLAUDE.md`).
- `views/mobile/MobilePostDetailPage.tsx` — wire the dialog.
- `views/mobile/MobileNotificationsPage.tsx` — the `post.extended` notification renders through the same `NotificationItem`, so no separate change unless mobile has its own item renderer (it doesn't — confirm).
- `MobileArchivePage.tsx` — if a moderator can reach an archived prayer here, surface Extend; otherwise archived-extend is reached via post detail (see §11 discovery note).

## 10. Tests

| Layer     | File                                                                     | Cases                                                                                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service   | `apps/api/test/services/posts.test.ts` (or new `posts.extend.test.ts`)   | published → new expires_at = now+N; archived → status flips to published + new expiry; `hidden`/`pending`/`rejected`/`draft` → `not_extendable`; event row written with correct payload; id/created_at/comments preserved; repeat extension allowed. |
| Route     | `apps/api/test/routes/mod-posts-extend.test.ts`                          | 200 for moderator/super_user; 403 for member; 404 for missing/other-org post; 409 `not_extendable`; 400 on bad `duration_days`; org-scoping (can't extend another org's post).                                                                       |
| Builder   | `apps/api/test/services/notification-builders/post-extended.test.ts`     | notifies author; **skips** when moderator === author; correct payload.                                                                                                                                                                               |
| Migration | `packages/db/test/migrations.test.ts` (auto via global-setup re-migrate) | up/down clean.                                                                                                                                                                                                                                       |
| Web hook  | `useExtendPost.test.tsx`                                                 | posts body, returns DTO, surfaces error.                                                                                                                                                                                                             |
| Web UI    | `PostMenu.test.tsx`                                                      | Extend shown for privileged on published+archived, hidden for member; `PostCard.test.tsx` renders the mark when `extended_at` set; `NotificationItem.test.tsx` renders the extended copy.                                                            |
| Mobile    | `MobilePostCard.test.tsx`                                                | parallel coverage.                                                                                                                                                                                                                                   |

## 11. Open / deferred (not blocking MVP)

- **Discovery of archived prayers to extend.** The active feed doesn't list archived posts, so a moderator reaches an archived prayer via direct link, a notification, or the comment thread that prompted the extension (the Pastor-Vince signal path). A dedicated "recently expired" moderator surface (possibly in mod-followup) is a **follow-up**, not part of this implementation.
- **Naming the moderator in the member-facing mark/notification.** Currently generic ("a moderator"). Flip to named easily later — the `extended_by` id is already persisted.
- **Re-pin / expiring-soon interplay.** Extending clears the `expiringSoon` pill automatically (it's derived from `expires_at`); no extra work, just confirm in `PostCard` test.

## 12. Suggested PR sequencing

1. Migration + schema types + events kind (`0028`, `schema.ts`, `events.ts`) — no behavior yet.
2. Service `extendPost` + DTO fields + route + app wiring + builder, with API tests. ← feature works end-to-end via API.
3. Web hook + dialog + `PostMenu` + the mark + `NotificationItem`, with web tests.
4. Mobile counterparts.

Each is independently reviewable; 1–2 are the load-bearing backend, 3–4 are UI.

---

## 13. As-built (what actually shipped)

The plan was followed closely. Concrete deltas worth recording:

### Files added

- `packages/db/migrations/0028_post_extension.sql` — `extended_at TIMESTAMPTZ`, `extended_by UUID REFERENCES users(id) ON DELETE SET NULL`.
- `apps/api/src/routes/mod-posts-extend.ts` — `POST /mod/posts/:id/extend`.
- `apps/api/src/services/notification-builders/post-extended.ts` — author DM builder.
- `apps/api/test/routes/mod-posts-extend.test.ts` (8 cases) + `apps/api/test/services/notification-builders/post-extended.test.ts` (2 cases).
- `apps/web/src/components/ExtendDialog.tsx` — duration dialog (reuses `PinDurationPicker`).

### Files changed

- `packages/db/src/schema.ts` — `PostsTable.extended_at` / `extended_by`.
- `apps/api/src/services/events.ts` — `'post.extended'` added to `PostEventKind`.
- `apps/api/src/services/posts.ts` — `extendPost`, `ExtendDurationDays`, `ExtendedByRef`; `PostRow`/`PostDto`/`toPostDto` gained `extended_at` + `extended_by`; `fetchPostRow` and the post-detail parent query `leftJoin users as extender`.
- `apps/api/src/services/feed.ts` — `posts.extended_at` added to the chronological + pinned parent projections.
- `apps/api/src/app.ts` — mounted the router under `requireModerator()` and registered `'post.extended': postExtendedBuilder` in the event worker.
- `apps/web/src/lib/api.ts` (`extendPost`), `apps/web/src/lib/time.ts` (`durationLabel`), `apps/web/src/hooks/useFeed.ts` (`FeedPost` fields), `components/PostMenu.tsx` (`onExtend` + `canExtend`), `components/PostCard.tsx` + `pages/PostDetailPage.tsx` (mark + dialog wiring), `components/NotificationItem.tsx` (`post.extended` branch), and the mobile counterparts `views/mobile/MobilePostCard.tsx` + `MobilePostDetailPage.tsx`.
- Fixtures updated for the two new `FeedPost` fields: `PostCard.test.tsx`, `UpdatePostItem.test.tsx`, `EditPostPage.test.tsx`, `views/mobile/__fixtures__/feedPost.ts`.

### Deviations from the plan

1. **No `useExtendPost` hook (§8b) — used the `lib/api.ts#extendPost` + page-local `act()` pattern instead.** Pinning has no `usePinPost` hook either; it calls `pinPost`/`unpinPost` from `lib/api` directly inside `PostDetailPage`. Extend follows that exact precedent for consistency, so the dialog's `onConfirm` calls `extendPost(...)` and `reload()`. A standalone hook would have been a lone snowflake.
2. **Dialog reuses `PinDurationPicker`, not `ExpiryPicker` (§3/§8c).** Both expose the same 1/3/7/14/30 choices, but `PinDurationPicker` is the moderator-action analog (same vesper styling, `DEFAULT_PIN_DAYS = 7`), so the extend dialog matches the pin dialog visually. `ExpiryPicker` is the author-compose control.
3. **Extend action lives on the post-detail page only (desktop + mobile), not on feed cards.** This mirrors pinning exactly (`PostCard` does not wire pin props; `PostDetailPage`/`MobilePostDetailPage` do). It also fits the motivation — a moderator reads the comment thread on the detail page, then extends. The **"Extended by a moderator" mark**, by contrast, renders on feed cards _and_ detail (both desktop + mobile).
4. **`extendPost` also rejects child updates** (`parent_id !== null → not_extendable`), beyond the status check in the §4 sketch — updates carry no independent expiry.
5. **Icon:** used the existing `clock` icon for the menu item (no new `calendar-plus` icon added).
6. **Menu label is status-aware:** "Extend…" on a published prayer, "Bring back…" on an archived one; the dialog and the author notification likewise say "brought your prayer back" when `was_archived` is true.
7. **`Notification['type']` is already `string`** in `hooks/useNotifications.ts` — no union to widen (the §8f note assumed a literal union).
8. **Named `extended_by` attribution is projected only on single-post reads** (`fetchPostRow`, post detail). In the feed/archive the mark renders generically ("Extended by a moderator") because those projections select `extended_at` but don't join the extender's name. Mirrors how the detail page is the home for richer attribution.

### Verification performed

- `pnpm build` (full `tsc -b` across refs + `vite build`) — green.
- `pnpm --filter @prayer/api test` — 540 passed (incl. 10 new extend tests; migration `0028` applied in global-setup).
- `pnpm --filter @prayer/web test` — 652 passed (incl. new `PostMenu` + `NotificationItem` extend cases).
- `pnpm lint` and `pnpm format:check` — clean.

## 14. Issues encountered

### Issue 1 — Pre-existing `pnpm build` break: zod v4 + TS 5.9 mis-infer `z.enum()` over a `readonly` tuple

**Not caused by this feature.** A recent dependabot bump put `zod@4.4.3` in the lockfile. With TypeScript 5.9, `z.enum(EMOJI_SET)` / `z.enum(FLAG_REASONS)` where the argument is an `as const` (readonly) tuple infers the member type as `tuple[keyof tuple]` — i.e. it pulls in `.length` (→ `6`/`4`), numeric indices, and array methods (`() => ArrayIterator<…>`) instead of the string-literal union. This made `parsed.data.emoji` / `parsed.data.reason` unassignable and broke `tsc -b` in `apps/api/src/routes/comments.ts` and `posts.ts` — **at HEAD, independent of any change here** (confirmed by stashing this branch's edits and rebuilding).

- **Fix applied:** assert the tuple to a mutable literal tuple at the `z.enum` call site in `packages/shared/src/emojis.ts` and `flag-reasons.ts`:
  ```ts
  export const emojiSchema = z.enum(EMOJI_SET as unknown as [Emoji, ...Emoji[]]);
  export const flagReasonSchema = z.enum(FLAG_REASONS as unknown as [FlagReason, ...FlagReason[]]);
  ```
  Runtime behavior is identical (zod still validates the same 6 emojis / 4 reasons); only the broken TS inference is corrected. Two-line change, no behavioral risk.
- **Why fix it here:** a red `pnpm build` blocks CI for the whole repo and makes it impossible to typecheck-verify this feature. It is a clearly-scoped, low-risk fix. If the team prefers, the alternative is pinning `zod` back below 4.x — a dependency decision left to the maintainers.

### Issue 2 — Local environment drift (node_modules + missing `.env.local`)

On first build the checkout had a **stale/incomplete `node_modules`** (`express-rate-limit` resolved to v8-API code but v7.5.1 was linked; many packages were behind the lockfile). `pnpm install` reconciled it to the committed lockfile (bumping `@types/node` 20→24 etc.) — no lockfile change, just a sync. Separately, **`apps/web/.env.local` was missing** (it's gitignored, per `apps/web/CLAUDE.md`), so web tests threw `VITE_AUTH_URL and VITE_AUTH_ANON_KEY must be set` at module-eval. Created it with dummy values (`VITE_API_URL` / `VITE_AUTH_URL` / `VITE_AUTH_ANON_KEY`). Both are documented worktree-bootstrap steps — environmental, not code issues — but recorded here since they blocked verification until resolved. (Postgres also had to be started via Docker for the API suite.)

### Issue 3 — `FeedPost` fixture fallout (expected, per CLAUDE.md)

Adding two required fields to `FeedPost` broke 28 type-checks across fixtures that construct one. `vitest` ignores this (structurally permissive); only `tsc -b` catches it. Fixed by adding `extended_at: null` / `extended_by: null` to each base fixture object. Files touched listed in §13. This is the exact gap the web CLAUDE.md warns about ("run `pnpm --filter @prayer/web build` after any shared-type change").

---

## 15. Follow-up UX (added after first review): clickable cards + Extend on the feed

User feedback after running the branch locally: the Extend action only appeared on the post-detail page (reached via the "Comment" / "View thread" link), which wasn't discoverable. Two changes address it.

### 15a. Whole prayer card opens the detail page (same tab)

`PostCard` and `MobilePostCard` now navigate to `/posts/:id` when you click the card body, so the card behaves like the rest of the row, not just the Comment link.

- New helper `apps/web/src/lib/cardClick.ts#isCardBodyClick(e)` decides whether a click should navigate: it returns `false` when the target is inside an interactive control (`a, button, input, textarea, select, label, [role="menu"|"menuitem"|"radio"|"dialog"|"alertdialog"]`), when it's a modified/secondary click, or when the user is selecting text. So Pray, Reactions, the ⋯ menu, the author link, "Show more", Repost/View-thread, and the modal overlays (ConfirmDialog `role="alertdialog"`, FlagModal `role="dialog"`) all keep working without double-navigating.
- Each card's `<article>` gets `onClick={(e) => { if (isCardBodyClick(e)) navigate(...) }}` and a `cursor-pointer`. The `ExtendDialog` is rendered as a **sibling of the `<article>`** (inside a fragment) so dialog clicks never reach the card handler.
- **Same-tab navigation** (per the product decision): a plain click uses `navigate()` and the browser Back button returns to the feed. We deliberately did **not** make the card a real link / `role="link"`, because the card already contains links and buttons — a nested-interactive role would be invalid and would trip the mobile `axe.spec.ts` audit.
- **A11y:** the card is a mouse/touch convenience; keyboard users still reach the post through the inner author and "Comment"/"View thread" links. Because the `<article>` is intentionally a non-focusable region with a click handler, the two `jsx-a11y` rules (`no-noninteractive-element-interactions`, `click-events-have-key-events`) are disabled on that one element with an explanatory comment.

### 15b. Extend from the feed/archive card ⋯ menu

Previously only `PostDetailPage` passed `viewerRole` + `onExtend` to `PostMenu`; the feed cards passed neither, so the menu showed no privileged actions. Now `PostCard` and `MobilePostCard`:

- pass `viewerRole={me.role}` and `onExtend={() => setExtendOpen(true)}` to their `PostMenu`, so a moderator/super_user sees **"Extend…"** (or **"Bring back…"** on an archived card) directly from the card's ⋯ menu;
- render their own `ExtendDialog`, and call `onChange?.()` after a successful extend so the list refreshes (same pattern as the existing delete flow). Pin was intentionally **not** added here — only `onExtend` is wired, so `canPin`/`canUnpin` stay false (they require `onPin`/`onUnpin`).

### 15c. Tests / verification for 15a–15b

- `PostCard.test.tsx` — new `describe('PostCard click-to-open')`: card-body click calls `navigate('/posts/:id')`; clicking the ⋯ menu does **not** navigate (`useNavigate` mocked).
- `PostMenu.test.tsx` already covers Extend visibility by `viewerRole` + status, which now also governs the feed cards.
- Full re-run after these changes: **654/654 web tests** pass, full `pnpm build` green, `pnpm lint` + `pnpm format:check` clean.
- Scope confirmed with the user: applies to feed **and** archive, desktop **and** mobile.
