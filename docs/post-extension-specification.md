# Post Extension Specification

> **Status:** Draft — open decisions in §5 still need the spec owner's call.
> **Branch:** `post-extension`
> **Last updated:** 06-09-2026

## 1. Summary

A **moderator** can extend the expiry of a prayer request — pushing back the date when the prayer would automatically be archived. Every published prayer post has an expiry (`posts.expires_at`); when that timestamp passes, the cron sweeper (`apps/api/src/services/expiry-job.ts`) flips the post from `published` to `archived` and it leaves the active feed. Extension moves `expires_at` further into the future so a still-relevant request keeps living in the feed, **without** the original author having to re-post it.

This is a moderator capability, parallel to pinning (`POST /mod/posts/:id/pin`): the author sets the original window at publish time, but a moderator can adjust the lifespan in response to what's happening in the community.

## 2. Why it matters

Sometimes a prayer hits its set expiry but the situation hasn't resolved — an illness drags on, a job search continues, a family is still waiting. The person who posted may not think (or want) to come back and re-publish.

Pastor Vince noted that **moderators often pick up the signal from the comment thread** — replies show the situation is still unfolding — and they should be able to extend the prayer in response. Extension lets them keep the request visible **without forcing the original author to re-post**, which today is the only option (`useRepostFromArchive`) and which severs the post's identity, history, prayer counts, reactions, and comment thread by creating a brand-new post.

So the feature serves two recurring cases:

- A prayer is **still active in the community's life** past its original expiration.
- The **comment thread reveals the situation is still unfolding** and warrants more visibility.

## 3. Goals

- Let a **moderator (and super_user)** push a post's `expires_at` further out.
- Preserve the post's identity and all associated data — same `id`, same `created_at`, same comments / reactions / prayers / updates.
- Keep feed ordering and "X ago" semantics intact: extension changes **expiry only**, never `created_at`.
- Fit the existing `/mod/*` + events-outbox + notification architecture (mirror pinning), not a side channel.
- Avoid making the original author re-post to keep a live request visible.

## 4. Non-Goals

- The author extending their own post (this is a moderator tool; revisit later if desired).
- Editing the post body or any field other than expiry during extension.
- Bulk / multi-post extension.
- Changing the cross-org cron sweep policy (it already reads `expires_at < NOW()` and needs no change).

## 5. Open Questions (for spec owner)

The motivation answered "who" (moderators) and "why" (comment-thread signals). These remain:

1. **Can a moderator extend a post that has _already_ expired/archived?**
   The motivation ("a prayer hits its set expiry but the situation hasn't resolved") suggests **yes** — extension should also rescue a post that just auto-archived, flipping it back to `published` with a new future `expires_at`. Need to confirm: extend only while `published`, or also un-archive within a grace window / from the archive at any time? _TBD_
2. **How much can be added?** A fresh full window (re-pick 1–365 days, like `ExpiryPicker`)? A fixed bump (e.g. +30 days)? Is there a max total lifespan or a cap on number of extensions per post? _TBD_
3. **Measured from when?** New expiry = `now + N days`, or `existing expires_at + N days`? (For an already-expired post these collapse to `now + N`.) _TBD_
4. **Who gets notified?** The original author? Everyone who prayed/commented? Nobody? _TBD_
5. **Is the extension visible?** An "extended by a moderator on …" marker on the post, or silent? Does the author see who extended it? _TBD_
6. **Is there a moderator-facing surface to find extension candidates,** or is it purely a per-post action from the post detail / mod queue? (Mod-followup already surfaces threads worth attention — possible home.) _TBD_

## 6. Proposed Behavior (placeholder — pending §5)

### Moderator-facing

- A moderator viewing a post (post detail, or a mod surface) sees an **Extend** action in `PostMenu` (privileged-only, alongside Pin / Hide).
- Selecting it opens a duration picker (reuse `ExpiryPicker`, 1–365 days).
- Confirming sets a new `expires_at`; the post stays (or returns) in the active feed and the "expiring soon" pill (`time.ts#expiringSoon`) clears if the new window is far out.
- _TBD: behavior when the target post is already archived (un-archive vs. reject) — see §5.1._

### Server-side

- New endpoint `POST /mod/posts/:id/extend`, `requireModerator`-gated, org-scoped — modeled directly on `routes/mod-posts-pin.ts`.
- In one transaction: validate the requested window (§5.2 caps), `UPDATE posts SET expires_at = …` (and `status = 'published'` if rescuing an archived post per §5.1) — **UPDATE-in-place**, never DELETE+INSERT, so id / created_at / thread survive.
- Write a `post.extended` row to the `events` outbox in the same transaction:
  `{ post_id, old_expires_at, new_expires_at, extended_by }`.
- `event-worker.ts` registers a handler — a notification builder if §5.4 = yes, otherwise a no-op (reserved), following the `post.pinned` precedent.
- Return the re-fetched DTO via `toPostDto` (same as pin/unpin).

## 7. Affected Surfaces (codebase map)

| Area          | File(s)                                                                                  | Change                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema        | `packages/db/migrations/*`                                                               | Likely **no** new column (`expires_at` exists). A new migration only if §5.5 needs an `extended_at` / `extended_by` column instead of deriving from events. |
| Expiry policy | `apps/api/src/services/expiry-job.ts`                                                    | No change — sweep already reads `expires_at < NOW()`.                                                                                                       |
| Posts service | `apps/api/src/services/posts.ts`                                                         | New `extendPost` (UPDATE expires_at [+ status]; write event).                                                                                               |
| Mod routes    | new `apps/api/src/routes/mod-posts-extend.ts` (or fold into pin router)                  | `POST /mod/posts/:id/extend`, mounted with `requireModerator()` in `app.ts`.                                                                                |
| Events        | `apps/api/src/services/events.ts`                                                        | Add `post.extended` event kind + payload shape.                                                                                                             |
| Event worker  | `apps/api/src/app.ts`, `event-worker.ts`                                                 | Register `post.extended` handler (builder or no-op).                                                                                                        |
| Notifications | `apps/api/src/services/notification-builders/`                                           | New builder if §5.4 = yes.                                                                                                                                  |
| Web — desktop | `PostMenu.tsx`, `PostDetailPage.tsx`, reuse `ExpiryPicker.tsx`, new `useExtendPost` hook | Privileged-only Extend action + duration dialog.                                                                                                            |
| Web — mobile  | `views/mobile/MobilePostCard.tsx`, `MobilePostDetailPage.tsx`                            | Mobile counterpart (parallel tree).                                                                                                                         |
| Web — roles   | `apps/web/src/lib/roles.ts`                                                              | Gate the action with `isPrivilegedRole`.                                                                                                                    |

## 8. Constraints & Conventions to honor

- **UPDATE-in-place, not DELETE+INSERT** — extension must preserve `id`, `created_at`, and the comment/reaction/prayer FKs. (Contrast `publishOwnDraft`, which intentionally refreshes them.)
- **Moderator gating** — mount under `auth, requireModerator()`, exactly like the pin / moderation / mod-followup routers.
- **Events outbox** — the expiry change is a post mutation, so it writes to `events` in the **same transaction** via `writePostEvent`.
- **Org scoping** — every query gates by `req.user.orgId` (note the `where('org_id', '=', req.user!.orgId)` on both read and write, per the pin router).
- **DTO** — any new client-visible field (`expires_at`, an extension marker) threads through `toPostDto`, not ad-hoc masking.
- **`exactOptionalPropertyTypes`** — spread optional fields conditionally.
- **Pin precedent for conflict states** — pin returns `409 { error: 'not_published' }` etc.; extension should mirror this for invalid-state cases (e.g. trying to extend something that can't be).

## 9. Acceptance Criteria

**Decisions resolved** (see `docs/post-extension-implementation.md` §0): §5.1 = **yes, un-archive on extend**; §5.2 = no cap; §5.3 = `now + N`; §5.4 = **yes, notify the author**; §5.5 = **persist + visible "Extended by a moderator" mark**.

All criteria below are **met and covered by automated tests**:

- [x] A moderator/super_user can extend an eligible post's expiry; a plain member cannot (403).
- [x] Extension preserves id, created_at, comments, reactions, prayers, and updates (no DELETE+INSERT).
- [x] The new `expires_at` is honored by the expiry sweeper (post is not archived until the new date).
- [x] An invalid-state extension (`draft`/`hidden`/`pending`/`rejected`, or a child update) is rejected with `409 { error: 'not_extendable' }`; bad `duration_days` → 400.
- [x] A `post.extended` event is written in the same transaction as the update.
- [x] Extending an already-archived post returns it to `published` with the new expiry (un-archive).
- [x] The author receives a `post.extended` notification (skipped when the moderator is the author).
- [x] Feed ordering is unchanged by an extension (created_at untouched).

## 10. Implementation status & issues

**Status: ✅ implemented & verified on branch `post-extension`.** Full `pnpm build` green; `pnpm lint` + `pnpm format:check` clean; 540/540 API + 652/652 web tests pass. The complete file-by-file account and the as-built deviations live in `docs/post-extension-implementation.md` (§13).

**Issues encountered during implementation** (detailed in the implementation doc §14):

1. **Pre-existing `pnpm build` break (not this feature):** a dependabot `zod@4.4.3` bump + TS 5.9 mis-infer `z.enum()` over the `readonly` `EMOJI_SET` / `FLAG_REASONS` tuples, breaking `apps/api/src/routes/{comments,posts}.ts` at HEAD. Fixed with a two-line, runtime-identical type assertion in `packages/shared/src/{emojis,flag-reasons}.ts`. (Alternative the maintainers may prefer: pin `zod` below 4.x.)
2. **Local environment drift:** stale `node_modules` (reconciled with `pnpm install`) and a missing gitignored `apps/web/.env.local` (recreated with dummy `VITE_*` values) blocked verification until fixed — both documented worktree-bootstrap steps, not code defects.
3. **`FeedPost` fixture fallout:** the two new DTO fields broke 28 fixture type-checks (caught only by `tsc -b`, not vitest); fixed by adding `extended_at`/`extended_by` to each base fixture.

## 11. Post-review UX additions

After running the feature locally, the spec owner asked for two discoverability improvements (built and verified — see `docs/post-extension-implementation.md` §15):

1. **Extend is now reachable from each prayer card's ⋯ menu** (feed + archive, desktop + mobile), not only from the post-detail page. Moderators/super_users see "Extend…" ("Bring back…" on an archived card) without opening the post first.
2. **Clicking anywhere on a prayer card** (outside its buttons/links) opens the post-detail page in the **same browser tab** (Back returns to the feed). Clicks on Pray, Reactions, the ⋯ menu, the author link, "Show more", and Repost/View-thread still do their own thing; text selection doesn't trigger navigation.

## 12. Notes / Additions

_(Space for the spec owner to add requirements.)_
