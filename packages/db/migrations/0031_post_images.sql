-- Up Migration

-- post_images: photos attached to a prayer request (max 3, enforced in the
-- service layer). post_id is NULLABLE on purpose: an image is uploaded the
-- moment the user picks it, which is before it belongs to any post. A NULL
-- post_id means "uploaded, not yet attached" and is the single indexable
-- predicate the orphan reaper scans. It also covers clients that keep their
-- draft in browser storage rather than in a server-side draft row.
--
-- ON DELETE CASCADE is safe for normal post deletion, but note that
-- publishOwnDraft does DELETE+INSERT: it must NULL out post_id before the
-- DELETE and re-point afterwards, or the cascade eats the images.
--
-- purged_at non-null means the full-size object has been deleted (archive
-- policy) while thumb_key still resolves.
CREATE TABLE post_images (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NULL REFERENCES posts(id) ON DELETE CASCADE,
  position INT NOT NULL CHECK (position >= 0 AND position <= 2),
  storage_key TEXT NOT NULL,
  thumb_key TEXT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  byte_size INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purged_at TIMESTAMPTZ NULL
);

-- Feed and detail hydration: fetch a page of posts' images in one query,
-- already ordered.
CREATE INDEX post_images_post_id_position_idx ON post_images (post_id, position);

-- Orphan reaper: a cheap range scan over just the unattached rows.
CREATE INDEX post_images_unattached_created_at_idx
  ON post_images (created_at)
  WHERE post_id IS NULL;

-- Delete-before-attach ownership checks.
CREATE INDEX post_images_owner_id_idx ON post_images (owner_id);

-- Down Migration

DROP TABLE IF EXISTS post_images;
