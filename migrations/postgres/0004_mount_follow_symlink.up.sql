-- Per-mount override for MOUNTPAD_FOLLOW_SYMLINK. See the SQLite
-- migration in the sibling file for the full semantics; in short:
-- this column can only TIGHTEN the global setting (when global is
-- off, nothing follows symlinks; when global is on, this column
-- decides per-mount).

ALTER TABLE mount_points
    ADD COLUMN IF NOT EXISTS follow_symlinks BOOLEAN NOT NULL DEFAULT TRUE;
