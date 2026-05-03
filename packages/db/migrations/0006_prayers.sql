-- Up Migration
CREATE TABLE prayers (
  id         UUID        PRIMARY KEY,
  post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

-- Down Migration
DROP TABLE IF EXISTS prayers;
