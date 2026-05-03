-- Up Migration
CREATE TABLE posts (
  id                 UUID        PRIMARY KEY,
  parent_id          UUID        NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id          UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status             post_status NOT NULL DEFAULT 'draft',
  is_anonymous       BOOLEAN     NOT NULL DEFAULT FALSE,
  is_answered_prayer BOOLEAN     NOT NULL DEFAULT FALSE,
  body               TEXT        NOT NULL,
  reaction_count     INT         NOT NULL DEFAULT 0,
  prayer_count       INT         NOT NULL DEFAULT 0,
  popularity_count   INT         GENERATED ALWAYS AS (prayer_count + reaction_count) STORED,
  latest_post_id     UUID        NULL,
  expires_at         TIMESTAMPTZ NULL,
  edit_deadline      TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Down Migration
DROP TABLE IF EXISTS posts;
