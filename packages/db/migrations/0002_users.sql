-- Up Migration
CREATE TABLE users (
  id               UUID        PRIMARY KEY,
  supabase_auth_id UUID        NOT NULL UNIQUE,
  email            TEXT        NOT NULL UNIQUE,
  display_name     TEXT        NOT NULL,
  avatar_url       TEXT        NULL,
  role             user_role   NOT NULL DEFAULT 'member',
  invite_slots     INT         NOT NULL DEFAULT 3,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Down Migration
DROP TABLE IF EXISTS users;
