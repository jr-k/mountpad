package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/mountpad/mountpad/internal/db"
	"github.com/mountpad/mountpad/internal/models"
	"github.com/mountpad/mountpad/internal/mountpoints"
)

type MountPointsHandler struct{ Svc *mountpoints.Service }

func NewMountPointsHandler(s *mountpoints.Service) *MountPointsHandler {
	return &MountPointsHandler{Svc: s}
}

func writeMountError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, mountpoints.ErrSlugInvalid),
		errors.Is(err, mountpoints.ErrNameRequired),
		errors.Is(err, mountpoints.ErrHostPath),
		errors.Is(err, mountpoints.ErrModeInvalid),
		errors.Is(err, mountpoints.ErrAvatarEmoji),
		errors.Is(err, mountpoints.ErrPrincipal):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, mountpoints.ErrSlugExists):
		http.Error(w, "slug already exists", http.StatusConflict)
	case errors.Is(err, db.ErrNotFound):
		http.Error(w, "not found", http.StatusNotFound)
	default:
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

func (h *MountPointsHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.Svc.Repo.List(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

type mountPayload struct {
	Slug           string `json:"slug"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	HostPath       string `json:"host_path"`
	IsActive       *bool  `json:"is_active,omitempty"`
	DefaultOwnerID *int64 `json:"default_owner_id,omitempty"`
	DefaultGroupID *int64 `json:"default_group_id,omitempty"`
	// Pointer semantics distinguish an omitted mode (use the default on
	// create, preserve the current value on patch) from an explicit 000.
	DefaultMode *uint16 `json:"default_mode,omitempty"`
	// AvatarColor is a CSS color string ("#rrggbb") or "" to mean "use
	// the deterministic palette". We accept it on every write - empty
	// is a valid value and the only way for the user to clear a
	// previously picked colour.
	AvatarColor string `json:"avatar_color"`
	AvatarEmoji string `json:"avatar_emoji"`
	// Omitted booleans use the database-facing defaults on creation.
	FollowSymlinks *bool `json:"follow_symlinks,omitempty"`
}

// nullableID preserves the three states a PATCH needs: omitted (leave the
// current value alone), a numeric ID (assign it), and null (clear it).
type nullableID struct {
	Set   bool
	Value *int64
}

func (n *nullableID) UnmarshalJSON(data []byte) error {
	n.Set = true
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		n.Value = nil
		return nil
	}
	var value int64
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	n.Value = &value
	return nil
}

type updateMountPayload struct {
	Slug           *string    `json:"slug,omitempty"`
	Name           *string    `json:"name,omitempty"`
	Description    *string    `json:"description,omitempty"`
	HostPath       *string    `json:"host_path,omitempty"`
	IsActive       *bool      `json:"is_active,omitempty"`
	DefaultOwnerID nullableID `json:"default_owner_id"`
	DefaultGroupID nullableID `json:"default_group_id"`
	DefaultMode    *uint16    `json:"default_mode,omitempty"`
	AvatarColor    *string    `json:"avatar_color,omitempty"`
	AvatarEmoji    *string    `json:"avatar_emoji,omitempty"`
	FollowSymlinks *bool      `json:"follow_symlinks,omitempty"`
}

func (h *MountPointsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var p mountPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	defaultMode := uint16(0o750)
	if p.DefaultMode != nil {
		defaultMode = *p.DefaultMode
	}
	isActive := true
	if p.IsActive != nil {
		isActive = *p.IsActive
	}
	followSymlinks := true
	if p.FollowSymlinks != nil {
		followSymlinks = *p.FollowSymlinks
	}
	m := &models.MountPoint{
		Slug: p.Slug, Name: p.Name, Description: p.Description,
		HostPath: p.HostPath, IsActive: isActive,
		DefaultOwnerID: p.DefaultOwnerID, DefaultGroupID: p.DefaultGroupID,
		DefaultMode:    defaultMode,
		AvatarColor:    p.AvatarColor,
		AvatarEmoji:    strings.TrimSpace(p.AvatarEmoji),
		FollowSymlinks: followSymlinks,
	}
	if err := h.Svc.Create(r.Context(), m); err != nil {
		writeMountError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

func (h *MountPointsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var p updateMountPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	m, err := h.Svc.Patch(r.Context(), id, mountpoints.Changes{
		Slug: p.Slug, Name: p.Name, Description: p.Description, HostPath: p.HostPath,
		IsActive:        p.IsActive,
		DefaultOwnerSet: p.DefaultOwnerID.Set, DefaultOwnerID: p.DefaultOwnerID.Value,
		DefaultGroupSet: p.DefaultGroupID.Set, DefaultGroupID: p.DefaultGroupID.Value,
		DefaultMode: p.DefaultMode, AvatarColor: p.AvatarColor, AvatarEmoji: p.AvatarEmoji,
		FollowSymlinks: p.FollowSymlinks,
	})
	if err != nil {
		writeMountError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

const maxMountAvatarBytes = 2 << 20

var allowedMountAvatarTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

func mountID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
}

func (h *MountPointsHandler) GetAvatar(w http.ResponseWriter, r *http.Request) {
	id, err := mountID(r)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	data, contentType, err := h.Svc.Repo.AvatarImage(r.Context(), id)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.NotFound(w, r)
		} else {
			http.Error(w, "internal error", http.StatusInternalServerError)
		}
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(data)
}

func (h *MountPointsHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	id, err := mountID(r)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxMountAvatarBytes+(1<<20))
	file, _, err := r.FormFile("avatar")
	if err != nil {
		http.Error(w, "avatar image is required", http.StatusBadRequest)
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxMountAvatarBytes+1))
	if err != nil {
		http.Error(w, "unable to read avatar image", http.StatusBadRequest)
		return
	}
	if len(data) == 0 || len(data) > maxMountAvatarBytes {
		http.Error(w, "avatar image must be at most 2 MB", http.StatusBadRequest)
		return
	}
	contentType := http.DetectContentType(data)
	if !allowedMountAvatarTypes[contentType] {
		http.Error(w, "avatar must be a JPEG, PNG, GIF, or WebP image", http.StatusBadRequest)
		return
	}
	if err := h.Svc.Repo.SetAvatarImage(r.Context(), id, data, contentType); err != nil {
		writeMountError(w, err)
		return
	}
	m, err := h.Svc.Repo.GetByID(r.Context(), id)
	if err != nil {
		writeMountError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (h *MountPointsHandler) DeleteAvatar(w http.ResponseWriter, r *http.Request) {
	id, err := mountID(r)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	if err := h.Svc.Repo.ClearAvatarImage(r.Context(), id); err != nil {
		writeMountError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *MountPointsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	if err := h.Svc.Repo.Delete(r.Context(), id); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
