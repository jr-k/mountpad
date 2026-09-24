ALTER TABLE mount_points ADD COLUMN avatar_emoji TEXT NOT NULL DEFAULT '';
ALTER TABLE mount_points ADD COLUMN avatar_image BLOB;
ALTER TABLE mount_points ADD COLUMN avatar_image_type TEXT NOT NULL DEFAULT '';
