-- Up Migration
CREATE TYPE user_role AS ENUM ('member', 'moderator', 'super_user');
CREATE TYPE post_status AS ENUM ('draft', 'published', 'archived', 'hidden');
CREATE TYPE reaction_target_type AS ENUM ('post', 'comment');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired');

-- Down Migration
DROP TYPE IF EXISTS invitation_status;
DROP TYPE IF EXISTS reaction_target_type;
DROP TYPE IF EXISTS post_status;
DROP TYPE IF EXISTS user_role;
