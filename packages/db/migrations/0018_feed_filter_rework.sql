-- Up Migration
DROP INDEX IF EXISTS idx_posts_popularity_count;
DROP INDEX IF EXISTS idx_posts_latest_post_id;
ALTER TABLE posts DROP COLUMN IF EXISTS popularity_count;
ALTER TABLE posts DROP COLUMN IF EXISTS latest_post_id;
CREATE INDEX IF NOT EXISTS idx_posts_created_at
  ON posts (created_at DESC)
  WHERE parent_id IS NULL AND status = 'published';

-- Down Migration
DROP INDEX IF EXISTS idx_posts_created_at;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS latest_post_id UUID NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS popularity_count INT
  GENERATED ALWAYS AS (prayer_count + reaction_count) STORED;
CREATE INDEX IF NOT EXISTS idx_posts_latest_post_id
  ON posts (latest_post_id DESC) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_popularity_count
  ON posts (popularity_count DESC) WHERE parent_id IS NULL;
