-- Up Migration
CREATE INDEX idx_posts_latest_post_id ON posts (latest_post_id DESC) WHERE parent_id IS NULL;
CREATE INDEX idx_posts_popularity_count ON posts (popularity_count DESC) WHERE parent_id IS NULL;
CREATE INDEX idx_posts_expires_at ON posts (expires_at) WHERE status = 'published';
CREATE INDEX idx_posts_parent_id ON posts (parent_id);
CREATE INDEX idx_posts_author_id ON posts (author_id);
CREATE INDEX idx_comments_post_id ON comments (post_id);
CREATE INDEX idx_comments_author_id ON comments (author_id);
CREATE INDEX idx_reactions_target ON reactions (target_type, target_id);
CREATE INDEX idx_reactions_author_id ON reactions (author_id);
CREATE INDEX idx_prayers_post_id ON prayers (post_id);
CREATE INDEX idx_events_pending ON events (id) WHERE processed_at IS NULL;
CREATE INDEX idx_notifications_user_unread ON notifications (user_id, read_at);
CREATE INDEX idx_invitations_invitor_id ON invitations (invitor_id);

-- Down Migration
DROP INDEX IF EXISTS idx_invitations_invitor_id;
DROP INDEX IF EXISTS idx_notifications_user_unread;
DROP INDEX IF EXISTS idx_events_pending;
DROP INDEX IF EXISTS idx_prayers_post_id;
DROP INDEX IF EXISTS idx_reactions_author_id;
DROP INDEX IF EXISTS idx_reactions_target;
DROP INDEX IF EXISTS idx_comments_author_id;
DROP INDEX IF EXISTS idx_comments_post_id;
DROP INDEX IF EXISTS idx_posts_author_id;
DROP INDEX IF EXISTS idx_posts_parent_id;
DROP INDEX IF EXISTS idx_posts_expires_at;
DROP INDEX IF EXISTS idx_posts_popularity_count;
DROP INDEX IF EXISTS idx_posts_latest_post_id;
