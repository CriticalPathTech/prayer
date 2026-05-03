-- Up Migration
-- Consolidate existing drafts: for each author, keep only the most recent
-- root-level draft; archive the rest so the partial unique index below can
-- be created without violating the constraint.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY author_id ORDER BY created_at DESC) AS rn
  FROM posts
  WHERE status = 'draft' AND parent_id IS NULL
)
UPDATE posts
SET status = 'archived'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Enforce at most one root-level draft per user.
-- Updates (parent_id IS NOT NULL) are not subject to this rule.
CREATE UNIQUE INDEX IF NOT EXISTS one_draft_per_user_idx
  ON posts (author_id)
  WHERE status = 'draft' AND parent_id IS NULL;

-- Down Migration
DROP INDEX IF EXISTS one_draft_per_user_idx;
-- NOTE: down does not un-archive the consolidated drafts; the consolidation
-- is not safely reversible because we can't distinguish pre-migration
-- archived drafts from organically-archived ones.
