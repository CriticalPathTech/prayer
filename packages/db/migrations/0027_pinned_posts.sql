-- Up Migration

-- Pinned prayer requests: mods/super_users can pin posts to the top of the wall.
-- All three columns flip together — pinned (all NOT NULL) or unpinned (all NULL).
-- Enforced in service code; no CHECK constraint, keeps manual-unpin path simple.
ALTER TABLE posts
  ADD COLUMN pinned_at TIMESTAMPTZ NULL,
  ADD COLUMN pin_until TIMESTAMPTZ NULL,
  ADD COLUMN pinned_by UUID NULL REFERENCES users(id);

-- Partial index supports the per-org pinned-posts query without scanning
-- the full table. Most rows have pinned_at IS NULL so the index stays small.
CREATE INDEX idx_posts_pinned ON posts (pinned_at DESC) WHERE pinned_at IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS idx_posts_pinned;
ALTER TABLE posts
  DROP COLUMN IF EXISTS pinned_by,
  DROP COLUMN IF EXISTS pin_until,
  DROP COLUMN IF EXISTS pinned_at;
