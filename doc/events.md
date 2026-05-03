# Event System

All events are written to the `events` table and delivered to the event worker via Postgres `LISTEN/NOTIFY`. The worker processes each event exactly once (first replica to win the `UPDATE ... WHERE processed_at IS NULL` race owns it).

## Table schema

```
id           UUID PRIMARY KEY  UUIDv7 — chronologically sortable
type         TEXT              event kind string (see below)
post_id      UUID | null       FK → posts (nullable for invite events)
actor_id     UUID | null       FK → users (null for auto-moderation)
payload      JSONB             shape varies by type (see below)
processed_at TIMESTAMPTZ | null  set when worker handles it
created_at   TIMESTAMPTZ
```

## Event catalogue

### Post events

Published by: `services/events.ts#writePostEvent`, called inside the same DB transaction as the mutation.

| Event                 | Trigger                       | Payload |
| --------------------- | ----------------------------- | ------- |
| `post.created`        | Draft saved                   | `{}`    |
| `post.published`      | Draft → published             | `{}`    |
| `post.edited`         | Body or expiry changed        | `{}`    |
| `post.archived`       | Post archived                 | `{}`    |
| `post.update_created` | Prayer update added to a post | `{}`    |

**Subscribers (event-worker builtinHandlers):**

- `snapshotUpdater` — advances the in-memory `SnapshotHolder` (used only for the "tap to refresh" banner, see [Snapshot](#snapshot) below)

---

### Comment events

Published by: `services/events.ts#writeCommentEvent` (alias of `writePostEvent`).

| Event             | Trigger              | Payload               |
| ----------------- | -------------------- | --------------------- |
| `comment.created` | New comment posted   | `{ body, author_id }` |
| `comment.edited`  | Comment body changed | `{}`                  |
| `comment.deleted` | Comment soft-deleted | `{}`                  |

**Subscribers:**

- `comment.created` → `notification-builders/comment-created.ts` — sends in-app notification to the post author
- `comment.edited` → noop
- `comment.deleted` → noop

---

### Reaction events

Published by: `services/events.ts#writeReactionEvent`.

| Event              | Trigger                | Payload                                                  |
| ------------------ | ---------------------- | -------------------------------------------------------- |
| `reaction.added`   | Emoji reaction added   | `{ target_type: 'post' \| 'comment', target_id, emoji }` |
| `reaction.removed` | Emoji reaction removed | `{ target_type: 'post' \| 'comment', target_id, emoji }` |

**Subscribers (`app.ts` reactionHandler):**

- `reactionCountRecomputer` — recalculates and stores the reaction count on the target
- `snapshotUpdater` — advances snapshot **only when `target_type === 'post'`** (comment reactions do not trigger "tap to refresh")

---

### Prayer events

Published by: `services/events.ts#writePrayerEvent`.

| Event            | Trigger                   | Payload       |
| ---------------- | ------------------------- | ------------- |
| `prayer.added`   | User taps "I Will Pray"   | `{ post_id }` |
| `prayer.removed` | User removes their prayer | `{ post_id }` |

**Subscribers (`app.ts` prayerHandler):**

- `prayerCountRecomputer` — recalculates and stores the prayer count on the post
- `snapshotUpdater` — advances snapshot (a new prayer is considered feed activity)

---

### Flag events

Published by: `services/events.ts#writeFlagEvent`.

| Event           | Trigger                        | Payload                                              |
| --------------- | ------------------------------ | ---------------------------------------------------- |
| `flag.created`  | User reports a post or comment | `{ flag_id, target_type, target_id, reason, note? }` |
| `flag.resolved` | Moderator resolves a flag      | `{ flag_id, target_type, target_id, reason, note? }` |

**Subscribers:**

- `flag.created` → `services/flag-consumer.ts` — auto-hides post/comment when flag count reaches threshold (≥2); writes `moderator.hide` event with `source='auto'`, `actor_id=null`
- `flag.created` → `notification-builders/flag-created.ts` — sends in-app notification to moderators
- `flag.resolved` → `services/flag-consumer.ts` — updates flag state

---

### Moderation events

Published by: `services/moderation.ts` (manual hide/unhide) and `services/flag-consumer.ts` (auto-hide).

| Event              | Trigger                              | Payload                                                           |
| ------------------ | ------------------------------------ | ----------------------------------------------------------------- |
| `moderator.hide`   | Post/comment hidden (manual or auto) | `{ target_type, target_id, source: 'manual' \| 'auto', reason? }` |
| `moderator.unhide` | Post/comment unhidden                | `{ target_type, target_id, source: 'manual' }`                    |

**Subscribers:**

- `moderator.hide` → `notification-builders/moderator-hide.ts` — sends in-app notification to the post author
- `moderator.unhide` → noop

---

### Invite events

Published by: `services/events.ts#writeInvitationEvent`.

| Event                 | Trigger                                 | Payload                                                                           |
| --------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| `invite.accepted`     | Invitee creates account via invite link | `{ invitation_id, invitee_id, invitee_display_name }`                             |
| `invitation.redeemed` | Invite code redeemed                    | `{ invitation_id, invitor_id, invitee_id, invite_code_id, invitee_display_name }` |

**Subscribers:**

- `invite.accepted` → `notification-builders/invite-accepted.ts` — sends in-app notification to the inviter
- `invitation.redeemed` → **no handler registered** (processed with a warning log, no side effect)

---

## Snapshot

The snapshot is a single value — the max `posts.id` among published posts — used to tell clients whether new posts have appeared since they last loaded the feed.

**Where it is used:** only one place — `GET /feed/snapshot` polled by the web client every 30 seconds. When the returned ID differs from what the client stored on last feed load, the "New activity — tap to refresh" banner appears.

**Where it is NOT used:** counts, notifications, moderation, cursors — nothing else reads the snapshot.

**Flow:**

```
Client loads feed
  → GET /feed returns { posts, snapshotId }   ← client stores this as baseline
  → every 30s: GET /feed/snapshot             ← client compares to baseline
      if different → show banner
      if same     → no-op

User taps banner
  → GET /feed (refresh)                       ← new baseline stored, banner hidden
```

**Current implementation:** both endpoints query `max(events.id::text) WHERE processed_at IS NOT NULL` directly from the DB, so all replicas return the same value regardless of in-memory state.

**Proposed redesign:** narrow the trigger to `post.published` only and use `max(posts.id) WHERE status = 'published'` with a short in-memory TTL cache, decoupling the snapshot entirely from the event worker.
