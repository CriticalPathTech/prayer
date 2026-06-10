-- Up Migration

-- Post extension: a moderator can push back a prayer's expiry (and un-archive an
-- already-expired one) so a still-active request keeps living in the feed without
-- the author re-posting. These two columns record the most recent extension for
-- the "Extended by a moderator" mark + audit. Both NULL until first extended.
-- ON DELETE SET NULL mirrors moderated_by (0026): removing a moderator's user row
-- must not cascade-delete the prayers they extended.
ALTER TABLE posts
  ADD COLUMN extended_at TIMESTAMPTZ NULL,
  ADD COLUMN extended_by UUID NULL REFERENCES users(id) ON DELETE SET NULL;

-- Down Migration

ALTER TABLE posts
  DROP COLUMN IF EXISTS extended_by,
  DROP COLUMN IF EXISTS extended_at;
