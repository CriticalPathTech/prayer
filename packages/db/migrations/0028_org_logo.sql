-- Up Migration
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS logo_svg        TEXT        NULL;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS logo_fill_mode  TEXT        NULL;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS logo_color      TEXT        NULL;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS logo_updated_at TIMESTAMPTZ NULL;

-- Down Migration
ALTER TABLE orgs DROP COLUMN IF EXISTS logo_updated_at;
ALTER TABLE orgs DROP COLUMN IF EXISTS logo_color;
ALTER TABLE orgs DROP COLUMN IF EXISTS logo_fill_mode;
ALTER TABLE orgs DROP COLUMN IF EXISTS logo_svg;
