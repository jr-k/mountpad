package manifests

import "time"

// EntryType distinguishes file vs directory entries in a manifest.
type EntryType string

const (
	EntryFile EntryType = "file"
	EntryDir  EntryType = "directory"
)

// Entry is the persisted ACL row for a single child of a directory.
// Names use the file's basename, NOT an absolute or relative path. This makes
// the manifest portable: renaming a parent directory does not invalidate any
// entry, and moving a directory carries the manifest with it.
type Entry struct {
	Type     EntryType `json:"type"`
	OwnerID  *int64    `json:"owner_id,omitempty"`
	GroupID  *int64    `json:"group_id,omitempty"`
	Mode     uint16    `json:"mode"` // 0..0777
	Modified time.Time `json:"modified_at,omitempty"`
}

// Manifest is the JSON document persisted as a hidden file at the root of
// each directory that has at least one explicit ACL override.
type Manifest struct {
	Version int              `json:"version"`
	Entries map[string]Entry `json:"entries"`
}

func New() *Manifest {
	return &Manifest{Version: 1, Entries: map[string]Entry{}}
}
