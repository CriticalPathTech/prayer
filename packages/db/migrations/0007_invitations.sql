-- Up Migration
CREATE TABLE invitations (
  id         UUID              PRIMARY KEY,
  invitor_id UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id UUID              NULL REFERENCES users(id) ON DELETE SET NULL,
  token      TEXT              NOT NULL UNIQUE,
  status     invitation_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ       NOT NULL,
  created_at TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- Down Migration
DROP TABLE IF EXISTS invitations;
