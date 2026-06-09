ALTER TABLE users
    DROP COLUMN IF EXISTS first_name,
    DROP COLUMN IF EXISTS last_name,
    DROP COLUMN IF EXISTS email,
    DROP COLUMN IF EXISTS avatar_color;

ALTER TABLE groups
    DROP COLUMN IF EXISTS avatar_color;
