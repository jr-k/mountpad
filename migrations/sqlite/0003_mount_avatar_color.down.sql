-- SQLite supports ALTER TABLE DROP COLUMN since 3.35 (2021-03), which is
-- comfortably below our minimum runtime version.

ALTER TABLE mount_points DROP COLUMN avatar_color;
