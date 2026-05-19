-- Up Migration

ALTER TABLE posts
  DROP CONSTRAINT IF EXISTS posts_moderated_by_fkey;

ALTER TABLE posts
  ADD CONSTRAINT posts_moderated_by_fkey
  FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL;

-- Down Migration

ALTER TABLE posts
  DROP CONSTRAINT IF EXISTS posts_moderated_by_fkey;

ALTER TABLE posts
  ADD CONSTRAINT posts_moderated_by_fkey
  FOREIGN KEY (moderated_by) REFERENCES users(id);
