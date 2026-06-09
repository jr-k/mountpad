-- Profile fields: per-user identity (first/last name, email) and an
-- avatar color the user can pick. SQLite doesn't support multi-column
-- ALTER TABLE, so each new field is added on its own line.

ALTER TABLE users ADD COLUMN first_name   TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN last_name    TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN email        TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN avatar_color TEXT NOT NULL DEFAULT '';

ALTER TABLE groups ADD COLUMN avatar_color TEXT NOT NULL DEFAULT '';
