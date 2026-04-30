-- Up Migration
ALTER TABLE users DROP COLUMN role;

-- Down Migration
ALTER TABLE users ADD COLUMN role user_role NOT NULL DEFAULT 'member';
-- Best-effort restore from user_orgs: pick the highest role per user.
UPDATE users SET role = uo.role
FROM (
  SELECT DISTINCT ON (user_id) user_id, role
  FROM user_orgs
  ORDER BY user_id, CASE role
    WHEN 'super_user' THEN 0
    WHEN 'moderator'  THEN 1
    WHEN 'member'     THEN 2
  END
) uo
WHERE users.id = uo.user_id;
