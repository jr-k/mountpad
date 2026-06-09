-- Requires SQLite 3.35+ for DROP COLUMN (modernc.org/sqlite ships a recent
-- amalgamation, so this works in practice).
ALTER TABLE users  DROP COLUMN first_name;
ALTER TABLE users  DROP COLUMN last_name;
ALTER TABLE users  DROP COLUMN email;
ALTER TABLE users  DROP COLUMN avatar_color;
ALTER TABLE groups DROP COLUMN avatar_color;
