-- Up Migration
CREATE TABLE reactions (
  id          UUID                 PRIMARY KEY,
  target_type reaction_target_type NOT NULL,
  target_id   UUID                 NOT NULL,
  author_id   UUID                 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       TEXT                 NOT NULL,
  created_at  TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  UNIQUE (target_type, target_id, author_id, emoji)
);

-- Down Migration
DROP TABLE IF EXISTS reactions;
