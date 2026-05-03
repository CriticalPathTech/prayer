# Prayer Design System Adoption — Close-out Notes

**Date:** 2026-04-19
**Spec:** [`docs/superpowers/specs/2026-04-19-design-system-adoption-design.md`](superpowers/specs/2026-04-19-design-system-adoption-design.md)
**Plan:** [`docs/superpowers/plans/2026-04-19-design-system-adoption.md`](superpowers/plans/2026-04-19-design-system-adoption.md)

All 17 planned tasks landed on `main` in a single session (subagent-driven execution).

## What shipped

Parchment & Vesper design system: warm cream ground (`#fbf7f1`), deep violet accent (`#5849a2`), gold reserved for Answered Prayer, serif names + body (Source Serif 4), Inter UI chrome, Lucide icons at 1.5px stroke.

- **Foundation (Tasks 2–4):** Tailwind `theme.extend` with parchment/vesper/dawn/sage/ember/warm palettes; CSS custom properties in `design-tokens.css`; self-hosted fonts via `@fontsource/*`; keyframes (`check-bloom`, `shimmer`, `fade-in`, `slide-down`) with `prefers-reduced-motion` collapse; 22 Lucide SVGs consumed via `vite-plugin-svgr`; atoms in `apps/web/src/components/ui/` (Icon, Button, Pill, Avatar, Field, Reactions).
- **Hero components (Tasks 5–6):** PrayButton rewrite ("I Will Pray" / "Prayed" with check-bloom + count fix); Reactions popover replacing EmojiBar + ReactionBadges (Esc closes + returns focus, click-outside, `EMOJI_SET = ['🙏','❤️','💪','😢','✝️','🙌']`).
- **Screens (Tasks 7–16):** Layout wordmark + sigil, LoginPage with background watermark, PostCard, FeedPage + SortTabs + NewActivityBanner + empty state, UpdatePostItem gold-gradient for Answered, CommentItem/CommentForm/CommentThread, PostDetailPage at `max-w-detail` with serif 22px body, ComposePage with "What's on your heart?" + "Share" button + chip-row ExpiryPicker, MyDrafts/MyArchive, Notifications (bell dot + panel card + per-type accent borders).
- **Copy (Tasks 8, 10, 14):** 5 visible strings changed — "That didn't match. Try again." (login), "Nothing on the wall yet." (empty feed), "What's on your heart?" (compose placeholder), "Post without your name" + "Only Super Users can see who wrote it." (anonymity toggle), "Share" (replacing "Publish").

## Verification

- Tests: **95 web + 188 api + 1 db = 284 passing.** Typecheck, lint, prettier clean.
- CI green on commit `cf47bce`.
- Railway web deploy SUCCESS on `cf47bce`; api unchanged on `30709bf` (no api files touched by the adoption).
- Production Playwright smoke verified on `https://web-production-e0fa8.up.railway.app` for `/login`, `/`, `/posts/:id`, `/compose`, PrayButton state transition, NewActivityBanner firing, and the Answered pill (via temporary DB toggle, reverted).

Screenshots saved under `.playwright-mcp/` in the repo root:

- `design-smoke-01-feed.png`
- `design-smoke-02-login.png`
- `design-smoke-03-post-detail.png`
- `design-smoke-04-compose.png`
- `design-smoke-06-prayed.png`

## Key adaptations from the plan

Three naming / API mismatches adapted per-task (plan was written before inventory was locked down):

- `useReactions` (not `usePostReactions`) returns `{ reactions, toggle }` (not `.state`). FeedPost has no `reactions` field → empty-map initial on feed cards (badges only render after viewer reacts).
- Icon atom's `size` union is `14 | 16 | 18 | 20 | 24 | 32` — plan's `size={15}` / `size={12}` / `size={64}` rounded to nearest.
- `Comment.mine` field doesn't exist — derived from `callerId === comment.author_id` in CommentItem.
- NewActivityBanner kept its `{ visible, onRefresh }` signature (rather than plan's `{ count, onRefresh }`) because `useFeedSnapshot` doesn't track a count.
- Layout `<main>` already at `max-w-[960px]` from Task 7; each page owns its inner width (`max-w-feed` 640px for FeedPage/drafts/archive/compose, `max-w-detail` 720px for PostDetailPage).
- LoginPage's `<Field>` needed conditional-spread for the `error` prop under `exactOptionalPropertyTypes: true` — caught by production build in CI (commit `cf47bce`).

## Deferred — revisit next

These were explicitly scoped out of the adoption per spec §9 and remain on the old Tailwind palette or absent entirely:

- **ModQueuePage restyle** (`apps/web/src/pages/ModQueuePage.tsx`) + flagging components (FlagButton, FlagModal, HideTombstone, HiddenBanner, FlagCountPill). Keep stock Tailwind until the moderation UX is revisited — different usability goals (speed, accuracy, red-alarm OK).
- **Mobile FAB** for "New request" on small screens. Current CTA is header-placed only.
- **Full a11y audit:** color-contrast sweep, focus-order review, screen-reader walk through the six primary flows, reduced-motion verification under all animations.
- **M8 invitation surfaces** (`/me/invites`, `/accept`, InviteModal, `services/invitations.ts`) — paused on the `milestone8` branch. When M8 resumes, build those screens against the design system from the start (Button/Field/Pill atoms + tokens) rather than retrofitting.
- **Answered Prayer photo capture on live data** — the plan's Step 3.5 DB-flip was reverted after the screenshot step was gated in the Playwright MCP environment. Unit tests cover the visual; consider a Storybook stub or a dedicated demo tenant for future visual diffs.

## Out-of-scope but worth flagging

- **Bundle size warning:** `apps/web` ships a 710 KB JS bundle (gzip 193 KB). Vite's 500 KB chunk warning surfaces. Consider route-level code splitting when we ship M8 + subsequent milestones — the bundle will keep growing.
- **Source Serif 4 + Inter self-hosting** adds ~40 assets to the `dist/assets/` output. Acceptable for now (fonts are cacheable, families are small subsets), but if the asset count becomes a deploy concern, narrow `@fontsource` imports to only the weights actually used.
