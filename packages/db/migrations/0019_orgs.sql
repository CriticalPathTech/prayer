-- Up Migration
CREATE TABLE orgs (
  id           UUID        PRIMARY KEY,
  slug         TEXT        NOT NULL UNIQUE,
  display_name TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orgs_slug ON orgs (slug);

-- Down Migration
DROP INDEX IF EXISTS idx_orgs_slug;
DROP TABLE IF EXISTS orgs;
