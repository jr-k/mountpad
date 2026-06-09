-- Mount-point avatar color: mirrors the same optional override we added
-- for users and groups in migration 0002. Empty default means "no pick"
-- and the frontend falls back to a deterministic palette entry derived
-- from the mount id, so existing rows render with a colour out of the
-- box without forcing an admin to revisit every mount.

ALTER TABLE mount_points ADD COLUMN avatar_color TEXT NOT NULL DEFAULT '';
