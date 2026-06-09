package models

import "time"

type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	DisplayName  string    `json:"display_name"`
	FirstName    string    `json:"first_name"`
	LastName     string    `json:"last_name"`
	Email        string    `json:"email"`
	// AvatarColor is a CSS color string ("#rrggbb" or empty). When empty,
	// the frontend renders a deterministic palette entry derived from the
	// user ID, so every account has *some* recognisable colour out of the
	// box without forcing a profile edit.
	AvatarColor  string    `json:"avatar_color"`
	PasswordHash string    `json:"-"`
	IsAdmin      bool      `json:"is_admin"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	GroupIDs     []int64   `json:"group_ids,omitempty"`
}

type Group struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	// AvatarColor mirrors the user field: optional override; empty means
	// "use the deterministic palette entry for this id".
	AvatarColor string    `json:"avatar_color"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type MountPoint struct {
	ID             int64     `json:"id"`
	Slug           string    `json:"slug"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	HostPath       string    `json:"host_path"`
	IsActive       bool      `json:"is_active"`
	DefaultOwnerID *int64    `json:"default_owner_id,omitempty"`
	DefaultGroupID *int64    `json:"default_group_id,omitempty"`
	DefaultMode    uint16    `json:"default_mode"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type Session struct {
	ID        string
	UserID    int64
	ExpiresAt time.Time
	CreatedAt time.Time
}

// FileEntry is returned by the filesystem layer (NOT from DB).
type FileEntry struct {
	Name        string    `json:"name"`
	Path        string    `json:"path"`
	IsDir       bool      `json:"is_dir"`
	Size        int64     `json:"size"`
	ModifiedAt  time.Time `json:"modified_at"`
	OwnerID     *int64    `json:"owner_id,omitempty"`
	OwnerName   string    `json:"owner_name,omitempty"`
	GroupID     *int64    `json:"group_id,omitempty"`
	GroupName   string    `json:"group_name,omitempty"`
	Mode        uint16    `json:"mode"`
	HasManifest bool      `json:"has_manifest,omitempty"`
}
