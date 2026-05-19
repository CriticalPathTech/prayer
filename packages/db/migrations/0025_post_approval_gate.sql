-- Up Migration

ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS requires_post_approval BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS moderation_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS moderated_by    UUID NULL REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS moderated_at    TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_posts_pending_fifo
  ON posts (org_id, created_at ASC)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS mod_post_skips (
  post_id      UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  moderator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL REFERENCES orgs(id),
  skipped_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, moderator_id)
);
CREATE INDEX IF NOT EXISTS idx_mod_post_skips_lookup ON mod_post_skips (moderator_id, post_id);

-- Down Migration
DROP INDEX IF EXISTS idx_mod_post_skips_lookup;
DROP TABLE IF EXISTS mod_post_skips;
DROP INDEX IF EXISTS idx_posts_pending_fifo;
ALTER TABLE posts
  DROP COLUMN IF EXISTS moderated_at,
  DROP COLUMN IF EXISTS moderated_by,
  DROP COLUMN IF EXISTS moderation_note;
ALTER TABLE orgs DROP COLUMN IF EXISTS requires_post_approval;
