-- Up Migration
CREATE TABLE events (
  id           UUID        PRIMARY KEY,
  type         TEXT        NOT NULL,
  payload      JSONB       NOT NULL,
  processed_at TIMESTAMPTZ NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Down Migration
DROP TABLE IF EXISTS events;
