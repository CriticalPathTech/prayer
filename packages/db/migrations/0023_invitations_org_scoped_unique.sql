-- Up Migration

-- Replace the global invitee uniqueness constraint with a per-org constraint
-- so that one user can redeem invites for multiple orgs (multi-org support).
-- The old constraint (invitee_id only) blocks any second redemption, even for a
-- different org — which is incorrect now that multi-org membership is supported.
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_invitee_unique;
CREATE UNIQUE INDEX invitations_invitee_org_unique ON invitations (invitee_id, org_id);

-- Down Migration

DROP INDEX IF EXISTS invitations_invitee_org_unique;
ALTER TABLE invitations ADD CONSTRAINT invitations_invitee_unique UNIQUE (invitee_id);
