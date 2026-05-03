-- no-transaction
-- Up Migration

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS invitee_email TEXT NULL;

ALTER TYPE invitation_status ADD VALUE IF NOT EXISTS 'revoked';

CREATE INDEX IF NOT EXISTS idx_invitations_invitor
  ON invitations (invitor_id);

-- Down Migration
DROP INDEX IF EXISTS idx_invitations_invitor;
-- Postgres cannot DROP an enum value. 'revoked' remains in invitation_status
-- after a down-migration; existing 'revoked' rows remain intact.
ALTER TABLE invitations DROP COLUMN IF EXISTS invitee_email;
