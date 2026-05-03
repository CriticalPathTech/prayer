-- Up Migration

CREATE TABLE invite_codes (
  id               UUID        PRIMARY KEY,
  owner_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code             VARCHAR(5)  NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9]{5}$'),
  seat_cap         INT         NOT NULL CHECK (seat_cap > 0 AND seat_cap <= 10),
  seats_remaining  INT         NOT NULL CHECK (seats_remaining >= 0 AND seats_remaining <= seat_cap),
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_invite_codes_owner ON invite_codes (owner_id);

-- invitations becomes a per-redemption ledger
DELETE FROM invitations;
ALTER TABLE invitations
  DROP COLUMN token,
  DROP COLUMN invitee_email,
  DROP COLUMN expires_at,
  DROP COLUMN status,
  ADD COLUMN invite_code_id UUID NOT NULL REFERENCES invite_codes(id) ON DELETE RESTRICT,
  ALTER COLUMN invitor_id SET NOT NULL,
  ALTER COLUMN invitee_id SET NOT NULL;
ALTER TABLE invitations ADD CONSTRAINT invitations_invitee_unique UNIQUE (invitee_id);
CREATE INDEX idx_invitations_invite_code ON invitations (invite_code_id);

-- the old enum 'invitation_status' is now unused
DROP TYPE IF EXISTS invitation_status;

-- mint an initial code with 3 seats for every existing user
DO $$
DECLARE
  r RECORD;
  new_code TEXT;
  attempts INT;
BEGIN
  FOR r IN SELECT id FROM users LOOP
    attempts := 0;
    LOOP
      new_code := lower(substr(md5(random()::text || r.id::text || clock_timestamp()::text), 1, 5));
      BEGIN
        INSERT INTO invite_codes (id, owner_id, code, seat_cap, seats_remaining)
        VALUES (gen_random_uuid(), r.id, new_code, 3, 3);
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        attempts := attempts + 1;
        IF attempts >= 10 THEN
          RAISE EXCEPTION 'failed to generate unique invite code for user %', r.id;
        END IF;
      END;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE users DROP COLUMN invite_slots;

-- Down Migration

ALTER TABLE users ADD COLUMN invite_slots INT NOT NULL DEFAULT 3;

CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');

DROP INDEX IF EXISTS idx_invitations_invite_code;
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_invitee_unique;
ALTER TABLE invitations
  ADD COLUMN token TEXT,
  ADD COLUMN invitee_email TEXT,
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD COLUMN status invitation_status NOT NULL DEFAULT 'pending',
  ALTER COLUMN invitee_id DROP NOT NULL,
  DROP COLUMN invite_code_id;

DROP INDEX IF EXISTS idx_invite_codes_owner;
DROP TABLE IF EXISTS invite_codes;
