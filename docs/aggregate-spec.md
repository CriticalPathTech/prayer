# Prayer App — Aggregate Spec & Build Plan

**Date:** 2026-05-09
**Source:** Feedback meeting with Pastor Vince Reynolds (Lakeside Christian Church); follow-up brainstorming with the engineering owner.
**Audience:** Engineering. Companion to [feedback-summary-for-leaders.md](feedback-summary-for-leaders.md), which is the church-leader-facing version.

## What this is

A master plan that:

1. Lists every feature from the feedback meeting with Pastor Vince, in priority order.
2. Points to the per-feature spec for the detailed design.
3. Identifies dependencies and recommends a build order — which **may differ** from raw priority labels where one item is a prerequisite or where catalysts exist.
4. Names cross-cutting infrastructure that ships as part of multiple features (timezone setting, signup-flow inversion, permissions module).

Each linked spec is the source of truth for its feature. This doc is the index and the sequencing argument.

## Priorities at a glance

| Priority | Feature                                                              | Spec                                                                                                                                                        |
| -------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**   | Repost from archive (prerequisite for P0 #2's rejection→repost flow) | [repost-from-archive-spec.md](repost-from-archive-spec.md)                                                                                                  |
| **P0**   | Moderator approval gate                                              | [moderator-approval-gate-spec.md](moderator-approval-gate-spec.md)                                                                                          |
| **P0**   | Updates inline on the wall (with answered-prayer highlight)          | [updates-on-wall-spec.md](updates-on-wall-spec.md)                                                                                                          |
| **P1**   | Moderator follow-up dashboard                                        | [moderator-followup-dashboard-spec.md](moderator-followup-dashboard-spec.md)                                                                                |
| **P1**   | Pinned prayer requests                                               | [pinned-prayer-requests-spec.md](pinned-prayer-requests-spec.md)                                                                                            |
| **P2**   | Daily email digest (introduces org timezone setting)                 | [email-digest-spec.md](email-digest-spec.md)                                                                                                                |
| **P2**   | Member profile pages (consolidates Profile/Security tabs)            | [member-profile-page-spec.md](member-profile-page-spec.md)                                                                                                  |
| **P2**   | Moderator extends a prayer request                                   | _Not yet specced — brainstorm at impl time_ (sketch in this doc)                                                                                            |
| **P2**   | Sign in with Google + Apple (incl. Planning Center exploration)      | [social-login-spec.md](social-login-spec.md)                                                                                                                |
| **P3**   | Selective visibility — Tags only for Lakeside; Groups for waymaker   | [visibility-scoping-exploration.md](visibility-scoping-exploration.md) + [permissions-architecture-exploration.md](permissions-architecture-exploration.md) |

Three-month follow-up parking lot of items deliberately deferred: [followup-questions-3mo.md](followup-questions-3mo.md).

## Recommended build order

The priority labels reflect Pastor Vince's prioritization. Engineering sequencing should respect those labels but also account for prerequisites and shared infrastructure. The recommended order:

### Phase 1 — P0 + foundation

1. **Repost from archive** (P0 prerequisite). Small, mostly web-side. Ships first because P0 #2's rejection-→-repost flow relies on it. _Engineering effort: ~few days._
2. **Updates inline on the wall.** Independent of the approval gate; can be parallelized with the gate work. Touches feed query + `PostCard` rendering. _Engineering effort: ~1 week._
3. **Moderator approval gate.** The big P0 work. Touches database (new statuses, new columns, feature flag column on `orgs`), server (submit-flow changes, approve/reject endpoints, settings PATCH, feed query extension), web (pending pill, approvals tab, reject dialog, feature flag tab in `/admin/church`). _Engineering effort: ~3-4 weeks._

Phase 1 closes the P0 set. Recommended to ship items 1 and 2 first behind a quiet release, then item 3 as a more visible release.

### Phase 2 — P1

4. **Pinned prayer requests.** Small footprint — three nullable columns on `posts`, two new endpoints, one cron worker, a pinned section on the wall, a pin/unpin action. _Engineering effort: ~1-2 weeks._
5. **Moderator follow-up dashboard.** A new mod tab + queue. Mostly read-side: new endpoint, new web page (desktop + mobile). Performance work deferred — measure before optimizing. _Engineering effort: ~1-2 weeks._

These two are independent of each other and can ship in either order or in parallel.

### Phase 3 — P2

The order within Phase 3 matters more than within other phases because the items share infrastructure.

6. **Member profile pages + Profile/Security merge.** Lays the foundation for a unified self-profile page. Removes the need for a standalone `/me/email` page in the next item. _Engineering effort: ~1-2 weeks._ Existing `ProfilePage` and `SecurityPage` components are reused as tab contents — no rewrite, just relocation.
7. **Daily email digest.** Adds org timezone setting to `/admin/church` (small admin UI change), adds the digest worker, adds opt-out toggle as a section on the merged profile's Settings tab. The Resend integration goes in here. _Engineering effort: ~2-3 weeks._
8. **Moderator extends a prayer request.** Smaller item. Brief sketch in this doc; brainstorm at impl time. _Engineering effort: ~few days to 1 week._
9. **Sign in with Google + Apple.** Includes the **signup-flow inversion** (a meaningful refactor on its own). The signup-flow inversion is independent of social login per se and could be done earlier — but doing it as part of social login concentrates the change. Planning Center exploration is **separate** — does not block this work; we can scope it in parallel. _Engineering effort: ~3-4 weeks for Google + Apple; Planning Center TBD pending exploration._

The Phase 3 items share two pieces of infrastructure that get built once:

- **Org timezone setting** lands as part of email digest but is generally useful (could surface in other features later — pin durations, etc., though those are duration-based not absolute-time). One column on `orgs`, one form field on `/admin/church` settings tab.
- **Signup-flow inversion** lands as part of social login but rewrites email-signup too. Don't try to ship the inversion separately — bundle it with social login when we're ready to ship both.

### Phase 4 — P3

10. **Tags (selective visibility — for Lakeside)**. Lakeside wants tags only; Groups will be developed for Pastor David at Waymaker Christian Church. Both share architecture; we'll feature-flag groups so they're hidden in Lakeside's deployment.

This is also where the **structured permissions module** lands as the foundation for tags' visibility predicate (and for groups, when waymaker comes online). See [permissions-architecture-exploration.md](permissions-architecture-exploration.md) for the architectural argument; the recommendation is **Tier 2 (a structured TypeScript permissions module), not a full ReBAC tuple system**.

_Engineering effort: ~4-6 weeks for the full tags + groups + permissions-module landing, of which Lakeside-visible work is ~3 weeks._

## Items to prioritize out of label order

Three notable cases:

### A. Repost from archive — P0-prerequisite, not a separate priority

It wasn't on Pastor Vince's notes as a distinct item, but the rejection→archive→repost path in the moderator approval gate (P0 #2) requires it. So **repost ships first**, even though its label was not specified. Treat it as a prerequisite, not a competing priority.

### B. Org timezone — small foundation, ship alongside email digest

The timezone setting is small (~1 day of work) and useful for any feature that needs local-time scheduling. Bundled into the email-digest spec because that's the first feature to need it.

### C. Permissions module — catalyst, but introduced _only_ when needed

We could build the structured permissions module ahead of need (e.g., during P0 to centralize existing role checks). **We've decided not to.** The module pays for itself when the permission surface gets meaningfully larger — which happens at P3 with tags. Introducing it earlier would be a refactor for refactor's sake.

When tags arrive, the permissions module is established (`apps/api/src/services/permissions.ts`), and existing scattered role checks are migrated into it opportunistically as files are touched for other reasons. Don't do a "refactor weekend"; let it accrete.

## Cross-cutting notes

### Anonymity rule (consistent across all features)

The existing rule — `is_anonymous` posts hide the author from everyone except the post owner and super_user; moderators see "Anonymous member" — applies uniformly across all new features:

- **Approval queue:** moderators see "Anonymous member" for anonymous pending posts; super_user sees real author.
- **Follow-up dashboard:** same.
- **Member profile pages:** anonymous posts don't appear on a user's public profile (visible to self and super_user only).
- **Email digest:** counts only, no names — composition with anonymity is trivial.
- **Tags (P3):** anonymous + tag-scoped composes cleanly. Tag-scoped means visibility is restricted; anonymity means author is hidden. They stack.

Don't introduce per-feature anonymity bypasses for moderators without an explicit privacy-posture decision.

### Feature flags for Lakeside vs waymaker (Pastor David's church)

- **Approval gate**: per-org flag, already designed.
- **Groups (P3, waymaker only)**: needs to be feature-flagged per-org so Lakeside's super user doesn't see group-management UI. Tags are exposed regardless.
- **Planning Center sign-in (if it ships)**: per-deployment env var, like Google/Apple.

The "feature flag" infrastructure starts as a single column on `orgs` (per the approval-gate spec). Generalize to a registry / table when we hit ~5 flags (per the approval-gate spec's threshold note).

### Performance work deferred

Several specs include "evaluate denormalized counters / read replica / etc." notes. **Measure first**, optimize only when load demands it. Specifically:

- `update_count` / `comment_count` denormalized columns on `posts` (mentioned in updates-on-wall and follow-up dashboard specs).
- Read-replica routing for the follow-up dashboard's slow queries.
- Bulk-event suppression in the approval gate's snapshot bumper if many pending posts get auto-approved.

None are needed at small-church-launch scale.

### Three-month follow-up checkpoint

After the build is mostly live, walk through [followup-questions-3mo.md](followup-questions-3mo.md) with Pastor Vince + any other church leads onboarded by then. That doc captures items intentionally deferred from each spec — most are user-feedback-driven optimizations or governance posture decisions worth revisiting once we have real usage signal.

## Mod-extends-prayer-request — sketch

Not yet specced; this section is a placeholder so the item isn't lost.

**Surface area.**

- Server: extend `expires_at` on a published post (extends the wall lifetime). For an archived post, extending un-archives it (status flips to `published`, fresh `expires_at`). Mod or super_user only; not the post's own author (use the standard "edit your own" path for that).
- Audit: `extended_by UUID NULL`, `extended_at TIMESTAMPTZ NULL`, possibly a count of extensions. Or: don't bother with audit columns; if needed later, derive from events outbox.
- Web: an "Extend" action in `PostMenu` for moderators. Duration picker matches expiry choices (1d / 3d / 1w / 2w / 1m). Confirmation dialog optional; might be one click.
- Author notification: configurable. Default: notify the author with "A moderator extended your prayer for two more weeks." Pastor Vince to confirm.

**Open questions for the impl-time brainstorm:**

- Extending an already-extended prayer — keep stacking, or replace the previous extension's deadline?
- Maximum total extension (e.g., "no more than 6 months from original creation")?
- Should super_user have any additional powers a moderator doesn't (e.g., can extend rejected posts back into the queue)?
- UI surface: extend visible only on the post's detail page, or also on the wall card?

This item is small enough that brainstorming + spec-writing during the implementation phase (rather than now) is reasonable.

## Decisions captured (no leader confirmation needed)

These were resolved during brainstorming — listed here so future readers don't re-litigate.

- **Approval gate edits:** when the flag is on, no edits to pending or published posts. Author can delete and resubmit.
- **Approval-gate toggle-off:** refused if pending posts exist. Super user must clear the queue first.
- **Approval = DELETE+INSERT:** approved post gets a fresh `id` and `created_at` so it surfaces at the top of the wall.
- **Moderator self-approval:** mod's own posts skip the gate at submission time. Confirmed by user.
- **Updates skip the approval gate:** even with the flag on, posting an update to your own (already-approved) prayer publishes immediately.
- **Pin: no "indefinite" duration.** Max 1 month (matching expiry). Re-pinning while pinned is rejected (must unpin first).
- **Pin: no "Pinned by ..." caption or remaining-duration in the UI.** Data stored, not displayed.
- **Email digest: opt-in by default, single opt-out switch per membership.** Apple relay emails accepted as-is.
- **Member profile: anonymity rule preserved across all profile views.** Mods don't get bypass.
- **Member profile: `/profile` and `/security` redirect during a transition period, then deleted.**
- **Social login: opt-in via env var, default off for OSS.** Google free, Apple needs Apple Developer Account.
- **Social login: signup flow inverted to "auth first, invite-code second"** — replaces the localStorage-threading approach we initially considered. localStorage is unreliable across devices.
- **Tags (P3): personal, owner-private. Mod oversight is an open question for leaders.** Detailed engineering shape sketched in `visibility-scoping-exploration.md`.
- **Permissions architecture (P3): Tier 2 — structured TypeScript permissions module, not a custom OpenFGA-lite tuple system.** Detailed argument in `permissions-architecture-exploration.md`.

## Outstanding leader-confirmation items

These get answered before the corresponding feature ships:

- **Approval gate:** mod self-publish bypass posture; required-vs-optional rejection note.
- **Updates on the wall:** updates skipping the approval gate (governance question).
- **Follow-up dashboard:** preset thresholds; "no leadership response" definition; anonymity in this view.
- **Pinned:** default duration; pin cap or unlimited.
- **Email digest:** send time; first-time-poster count visibility; subject line tone.
- **Mod extends prayer request:** notification posture; archived-post un-archive support.
- **Social login:** Planning Center demand among reviewing churches.
- **Tags (P3):** mod-bypass posture for tag-scoped posts; default visibility on compose; naming.

These are captured in `feedback-summary-for-leaders.md` for the leaders' review.

## File map (this folder)

```
tmp/feedback-vince-2026-05-09/
├── aggregate-spec.md                            ← this file
├── feedback-summary-for-leaders.md              ← church-leader-facing summary
├── thank-you-email-pastor-vince.md              ← email draft
├── repost-from-archive-spec.md                  ← P0 prerequisite
├── moderator-approval-gate-spec.md              ← P0
├── updates-on-wall-spec.md                      ← P0
├── moderator-followup-dashboard-spec.md         ← P1
├── pinned-prayer-requests-spec.md               ← P1
├── email-digest-spec.md                         ← P2
├── member-profile-page-spec.md                  ← P2
├── social-login-spec.md                         ← P2
├── visibility-scoping-exploration.md            ← P3
├── permissions-architecture-exploration.md      ← P3 architectural companion
└── followup-questions-3mo.md                    ← parking lot for revisit-later items
```
