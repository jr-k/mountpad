package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/mountpad/mountpad/internal/auth"
	"github.com/mountpad/mountpad/internal/models"
	"github.com/mountpad/mountpad/internal/repositories"
)

type UsersHandler struct {
	Repo *repositories.UsersRepo
}

func NewUsersHandler(r *repositories.UsersRepo) *UsersHandler { return &UsersHandler{Repo: r} }

func (h *UsersHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.Repo.List(r.Context())
	if err != nil { http.Error(w, "internal error", http.StatusInternalServerError); return }
	for _, u := range list {
		u.GroupIDs, _ = h.Repo.GroupIDsFor(r.Context(), u.ID)
	}
	writeJSON(w, http.StatusOK, list)
}

// Directory returns a stripped-down list of users for non-admin consumers
// that just need to resolve owner IDs into a display name (e.g. the file
// tree's "details" toggle). It exposes nothing about admin status, group
// memberships, or activity so it's safe to leave reachable for every
// authenticated session.
type userDirectoryEntry struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

func (h *UsersHandler) Directory(w http.ResponseWriter, r *http.Request) {
	list, err := h.Repo.List(r.Context())
	if err != nil { http.Error(w, "internal error", http.StatusInternalServerError); return }
	out := make([]userDirectoryEntry, 0, len(list))
	for _, u := range list {
		out = append(out, userDirectoryEntry{ID: u.ID, Username: u.Username, DisplayName: u.DisplayName})
	}
	writeJSON(w, http.StatusOK, out)
}

type createUserPayload struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	FirstName   string `json:"first_name"`
	LastName    string `json:"last_name"`
	Email       string `json:"email"`
	AvatarColor string `json:"avatar_color"`
	Password    string `json:"password"`
	IsAdmin     bool   `json:"is_admin"`
}

func (h *UsersHandler) Create(w http.ResponseWriter, r *http.Request) {
	var p createUserPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	if p.Username == "" || p.Password == "" {
		http.Error(w, "username and password required", http.StatusBadRequest); return
	}
	hash, err := auth.HashPassword(p.Password)
	if err != nil { http.Error(w, "internal error", http.StatusInternalServerError); return }
	u := &models.User{
		Username:     p.Username,
		DisplayName:  p.DisplayName,
		FirstName:    p.FirstName,
		LastName:     p.LastName,
		Email:        p.Email,
		AvatarColor:  p.AvatarColor,
		PasswordHash: hash,
		IsAdmin:      p.IsAdmin,
		IsActive:     true,
	}
	if err := h.Repo.Create(r.Context(), u); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError); return
	}
	writeJSON(w, http.StatusCreated, u)
}

// updateUserPayload is also used by the self-update flow (PATCH /api/me)
// after stripping admin-only fields. Pointer fields make "absent" distinct
// from "explicit empty string", which matters for the avatar_color reset.
type updateUserPayload struct {
	DisplayName *string `json:"display_name,omitempty"`
	FirstName   *string `json:"first_name,omitempty"`
	LastName    *string `json:"last_name,omitempty"`
	Email       *string `json:"email,omitempty"`
	AvatarColor *string `json:"avatar_color,omitempty"`
	IsAdmin     *bool   `json:"is_admin,omitempty"`
	IsActive    *bool   `json:"is_active,omitempty"`
	Password    *string `json:"password,omitempty"`
}

// applyProfile mutates `u` with whatever profile fields the payload set.
// Admin / activity fields are intentionally left out: they live on `Update`
// directly so we can reuse this helper from both the admin endpoint and
// the self-update endpoint without leaking elevation.
func applyProfile(u *models.User, p *updateUserPayload) {
	if p.DisplayName != nil { u.DisplayName = *p.DisplayName }
	if p.FirstName != nil   { u.FirstName   = *p.FirstName }
	if p.LastName != nil    { u.LastName    = *p.LastName }
	if p.Email != nil       { u.Email       = *p.Email }
	if p.AvatarColor != nil { u.AvatarColor = *p.AvatarColor }
}

func (h *UsersHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil { http.Error(w, "bad id", http.StatusBadRequest); return }
	u, err := h.Repo.GetByID(r.Context(), id)
	if err != nil { http.Error(w, "not found", http.StatusNotFound); return }
	var p updateUserPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	applyProfile(u, &p)
	if p.IsAdmin != nil { u.IsAdmin = *p.IsAdmin }
	if p.IsActive != nil { u.IsActive = *p.IsActive }
	if err := h.Repo.Update(r.Context(), u); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError); return
	}
	if p.Password != nil && *p.Password != "" {
		hash, err := auth.HashPassword(*p.Password)
		if err != nil { http.Error(w, "internal error", http.StatusInternalServerError); return }
		_ = h.Repo.UpdatePassword(r.Context(), u.ID, hash)
	}
	writeJSON(w, http.StatusOK, u)
}

// UpdateMe lets a signed-in user edit their *own* profile fields and
// password. It runs under the regular `Required` middleware (no
// AdminOnly), but ignores any admin-only fields in the payload so a
// crafted request can't escalate.
func (h *UsersHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	caller := auth.UserFrom(r.Context())
	if caller == nil || auth.IsSynthetic(caller) {
		// The synthetic SAFE_MODE admin is not a real DB row: we let the
		// operator pick another account from the Access page instead.
		http.Error(w, "forbidden", http.StatusForbidden); return
	}
	u, err := h.Repo.GetByID(r.Context(), caller.ID)
	if err != nil { http.Error(w, "not found", http.StatusNotFound); return }
	var p updateUserPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	applyProfile(u, &p)
	// Self-update never touches is_admin / is_active even if the payload
	// includes them.
	if err := h.Repo.Update(r.Context(), u); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError); return
	}
	if p.Password != nil && *p.Password != "" {
		hash, err := auth.HashPassword(*p.Password)
		if err != nil { http.Error(w, "internal error", http.StatusInternalServerError); return }
		_ = h.Repo.UpdatePassword(r.Context(), u.ID, hash)
	}
	writeJSON(w, http.StatusOK, u)
}

func (h *UsersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil { http.Error(w, "bad id", http.StatusBadRequest); return }
	if err := h.Repo.Delete(r.Context(), id); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError); return
	}
	w.WriteHeader(http.StatusNoContent)
}

type addToGroupPayload struct {
	GroupID int64 `json:"group_id"`
}

func (h *UsersHandler) AddToGroup(w http.ResponseWriter, r *http.Request) {
	uid, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil { http.Error(w, "bad id", http.StatusBadRequest); return }
	var p addToGroupPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	if err := h.Repo.AddGroup(r.Context(), uid, p.GroupID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError); return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *UsersHandler) RemoveFromGroup(w http.ResponseWriter, r *http.Request) {
	uid, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil { http.Error(w, "bad id", http.StatusBadRequest); return }
	gid, err := strconv.ParseInt(chi.URLParam(r, "groupId"), 10, 64)
	if err != nil { http.Error(w, "bad group id", http.StatusBadRequest); return }
	if err := h.Repo.RemoveGroup(r.Context(), uid, gid); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError); return
	}
	w.WriteHeader(http.StatusNoContent)
}
