-- Per-mount override for MOUNTPAD_FOLLOW_SYMLINK. The default is 1
-- (= follow) so existing rows behave like before: when the global
-- knob is on, all mounts follow symlinks. Admins can now toggle this
-- to 0 on individual mounts to keep them strict even with the global
-- knob on (useful for mounts that point at user-writable trees where
-- a planted symlink could escape the root).
--
-- Note: the global knob is restrictive: when it's off, the per-mount
-- column is ignored - nothing follows symlinks. So this column can
-- only ever *tighten* the global setting, never loosen it.

ALTER TABLE mount_points ADD COLUMN follow_symlinks INTEGER NOT NULL DEFAULT 1;
