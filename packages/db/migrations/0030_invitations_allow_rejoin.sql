-- Up Migration

-- The invitations ledger was uniquely keyed on (invitee_id, org_id), which made
-- re-joining a church structurally impossible: removeMember drops the user_orgs
-- row but deliberately keeps the ledger row for audit, so a re-invited user
-- could never insert a second redemption. Membership is tracked by user_orgs;
-- invitations is history. Drop the unique constraint and keep a plain index for
-- the same lookup paths.
DROP INDEX IF EXISTS invitations_invitee_org_unique;
CREATE INDEX IF NOT EXISTS idx_invitations_invitee_org ON invitations (invitee_id, org_id);

-- Down Migration

DROP INDEX IF EXISTS idx_invitations_invitee_org;
-- Re-creating the unique index requires collapsing any leave/rejoin history to
-- one row per (invitee, org); keep the most recent redemption.
DELETE FROM invitations a
  USING invitations b
  WHERE a.invitee_id = b.invitee_id
    AND a.org_id = b.org_id
    AND a.id < b.id;
CREATE UNIQUE INDEX invitations_invitee_org_unique ON invitations (invitee_id, org_id);
