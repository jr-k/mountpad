CREATE TABLE IF NOT EXISTS user_mount_folder_avatars (
    user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id         TEXT NOT NULL,
    avatar_image      BYTEA NOT NULL,
    avatar_image_type TEXT NOT NULL,
    PRIMARY KEY (user_id, folder_id)
);
