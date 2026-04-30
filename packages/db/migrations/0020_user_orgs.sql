-- Up Migration
CREATE TABLE user_orgs (
  user_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id    UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role      user_role   NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, org_id)
);
CREATE INDEX idx_user_orgs_org_id ON user_orgs (org_id);

-- Down Migration
DROP INDEX IF EXISTS idx_user_orgs_org_id;
DROP TABLE IF EXISTS user_orgs;
