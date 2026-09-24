ALTER TABLE mount_points
    DROP COLUMN IF EXISTS avatar_image_type,
    DROP COLUMN IF EXISTS avatar_image,
    DROP COLUMN IF EXISTS avatar_emoji;
