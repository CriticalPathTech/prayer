-- Up Migration
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS participant_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT;

-- Backfill participant_id for any pre-M4 rows so the NOT NULL tighten below succeeds.
UPDATE comments SET participant_id = author_id WHERE participant_id IS NULL;

ALTER TABLE comments
  ALTER COLUMN participant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_post_participant ON comments(post_id, participant_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at);

-- Down Migration
DROP INDEX IF EXISTS idx_comments_post_created;
DROP INDEX IF EXISTS idx_comments_post_participant;
ALTER TABLE comments DROP COLUMN IF EXISTS participant_id;
ALTER TABLE comments DROP COLUMN IF EXISTS updated_at;
