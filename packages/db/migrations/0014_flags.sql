-- Up Migration
CREATE TABLE flags (
  id             UUID                 PRIMARY KEY,
  target_type    reaction_target_type NOT NULL,
  target_id      UUID                 NOT NULL,
  flagger_id     UUID                 NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason         TEXT                 NOT NULL,
  note           TEXT                 NULL,
  resolved_at    TIMESTAMPTZ          NULL,
  resolved_by_id UUID                 NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX flags_uniq_open
  ON flags (target_type, target_id, flagger_id)
  WHERE resolved_at IS NULL;
CREATE INDEX flags_target_open
  ON flags (target_type, target_id)
  WHERE resolved_at IS NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS flag_count INT NOT NULL DEFAULT 0;

-- Down Migration
ALTER TABLE posts DROP COLUMN IF EXISTS flag_count;
DROP INDEX IF EXISTS flags_target_open;
DROP INDEX IF EXISTS flags_uniq_open;
DROP TABLE IF EXISTS flags;
