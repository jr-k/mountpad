-- Profile fields: per-user identity (first/last name, email) and an
-- avatar color the user can pick. Defaults to empty so existing accounts
-- migrate transparently; an empty avatar_color tells the frontend to fall
-- back to the deterministic colour derived from the row id.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS first_name    TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS last_name     TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS email         TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS avatar_color  TEXT NOT NULL DEFAULT '';

ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS avatar_color  TEXT NOT NULL DEFAULT '';
