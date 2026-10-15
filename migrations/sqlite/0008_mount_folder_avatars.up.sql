CREATE TABLE user_mount_folder_avatars (
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id         TEXT NOT NULL,
    avatar_image      BLOB NOT NULL,
    avatar_image_type TEXT NOT NULL,
    PRIMARY KEY (user_id, folder_id)
);
