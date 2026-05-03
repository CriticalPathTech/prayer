-- Up Migration
CREATE TABLE comments (
  id             UUID        PRIMARY KEY,
  post_id        UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id      UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body           TEXT        NOT NULL,
  reaction_count INT         NOT NULL DEFAULT 0,
  is_hidden      BOOLEAN     NOT NULL DEFAULT FALSE,
  flag_count     INT         NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Down Migration
DROP TABLE IF EXISTS comments;
