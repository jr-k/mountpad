package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/mountpad/mountpad/internal/models"
	"github.com/mountpad/mountpad/internal/mountpoints"
)

type MountPointsHandler struct{ Svc *mountpoints.Service }

func NewMountPointsHandler(s *mountpoints.Service) *MountPointsHandler {
	return &MountPointsHandler{Svc: s}
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
	IsActive       bool   `json:"is_active"`
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
	// FollowSymlinks is the per-mount override of the global
	// MOUNTPAD_FOLLOW_SYMLINK env var. We accept it on every write
	// (true OR false are both meaningful) so admins can flip the
	// flag from the settings UI without having to redeploy. The
	// field is a non-pointer bool: a missing key in the JSON body
	// decodes to false, which would be a silent regression for any
	// client that doesn't send it. The frontend ALWAYS sends it.
	FollowSymlinks bool `json:"follow_symlinks"`
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
	m := &models.MountPoint{
		Slug: p.Slug, Name: p.Name, Description: p.Description,
		HostPath: p.HostPath, IsActive: p.IsActive,
		DefaultOwnerID: p.DefaultOwnerID, DefaultGroupID: p.DefaultGroupID,
		DefaultMode:    defaultMode,
		AvatarColor:    p.AvatarColor,
		FollowSymlinks: p.FollowSymlinks,
	}
	if err := h.Svc.Create(r.Context(), m); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
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
	m, err := h.Svc.Repo.GetByID(r.Context(), id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	var p mountPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if p.Slug != "" {
		m.Slug = p.Slug
	}
	if p.Name != "" {
		m.Name = p.Name
	}
	m.Description = p.Description
	if p.HostPath != "" {
		m.HostPath = p.HostPath
	}
	m.IsActive = p.IsActive
	m.DefaultOwnerID = p.DefaultOwnerID
	m.DefaultGroupID = p.DefaultGroupID
	if p.DefaultMode != nil {
		m.DefaultMode = *p.DefaultMode
	}
	// Empty string is a valid value (the user explicitly cleared the
	// custom colour to fall back on the deterministic palette), so we
	// always assign instead of guarding with `if != ""`.
	m.AvatarColor = p.AvatarColor
	m.FollowSymlinks = p.FollowSymlinks
	if err := h.Svc.Update(r.Context(), m); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, m)
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
