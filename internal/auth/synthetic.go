package auth

import "github.com/mountpad/mountpad/internal/models"

// SyntheticUserID is the sentinel ID for the in-memory "system" user that is
// injected into the request context whenever authentication is disabled or
// SAFE_MODE is active. It is never persisted and never referenced as an owner
// in a manifest.
const SyntheticUserID int64 = 0

// SyntheticAdmin returns an in-memory administrator user. It has IsAdmin=true,
// so the ACL resolver short-circuits every permission check successfully.
func SyntheticAdmin(safeMode bool) *models.User {
	name := "System (auth disabled)"
	if safeMode {
		name = "System (SAFE MODE)"
	}
	return &models.User{
		ID:          SyntheticUserID,
		Username:    "system",
		DisplayName: name,
		IsAdmin:     true,
		IsActive:    true,
	}
}

// IsSynthetic reports whether the supplied user is the in-memory synthetic
// admin rather than a real DB row.
func IsSynthetic(u *models.User) bool {
	return u != nil && u.ID == SyntheticUserID
}
