-- Up Migration
ALTER TABLE events ADD COLUMN IF NOT EXISTS post_id UUID NULL REFERENCES posts(id) ON DELETE CASCADE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS actor_id UUID NULL REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_unprocessed ON events(created_at) WHERE processed_at IS NULL;

-- Down Migration
DROP INDEX IF EXISTS idx_events_unprocessed;
DROP INDEX IF EXISTS idx_events_type;
ALTER TABLE events DROP COLUMN IF EXISTS actor_id;
ALTER TABLE events DROP COLUMN IF EXISTS post_id;
