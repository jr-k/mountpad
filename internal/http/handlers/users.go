package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/mountpad/mountpad/internal/auth"
	"github.com/mountpad/mountpad/internal/db"
	"github.com/mountpad/mountpad/internal/models"
	"github.com/mountpad/mountpad/internal/repositories"
)

type UsersHandler struct {
	Repo *repositories.UsersRepo
}

func NewUsersHandler(r *repositories.UsersRepo) *UsersHandler { return &UsersHandler{Repo: r} }

func (h *UsersHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.Repo.List(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
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
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
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
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if p.Username == "" || p.Password == "" {
		http.Error(w, "username and password required", http.StatusBadRequest)
		return
	}
	hash, err := auth.HashPassword(p.Password)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
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
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
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

func (h *UsersHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var p updateUserPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var passwordHash *string
	if p.Password != nil && *p.Password != "" {
		hash, err := auth.HashPassword(*p.Password)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		passwordHash = &hash
	}
	changes := repositories.UserChanges{
		DisplayName: p.DisplayName, FirstName: p.FirstName, LastName: p.LastName,
		Email: p.Email, AvatarColor: p.AvatarColor,
		IsAdmin: p.IsAdmin, IsActive: p.IsActive, PasswordHash: passwordHash,
	}
	u, err := h.Repo.UpdateAtomic(r.Context(), id, changes)
	if err != nil {
		if errors.Is(err, repositories.ErrLastActiveAdmin) {
			http.Error(w, "the last active administrator cannot be demoted or disabled", http.StatusConflict)
			return
		}
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
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
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	var p updateUserPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	// Self-update never touches is_admin / is_active even if the payload
	// includes them.
	var passwordHash *string
	if p.Password != nil && *p.Password != "" {
		hash, err := auth.HashPassword(*p.Password)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		passwordHash = &hash
	}
	changes := repositories.UserChanges{
		DisplayName: p.DisplayName, FirstName: p.FirstName, LastName: p.LastName,
		Email: p.Email, AvatarColor: p.AvatarColor, PasswordHash: passwordHash,
	}
	u, err := h.Repo.UpdateAtomic(r.Context(), caller.ID, changes)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, u)
}

type mountOrderPayload struct {
	MountIDs []int64 `json:"mount_ids"`
}

func (h *UsersHandler) UpdateMyMountOrder(w http.ResponseWriter, r *http.Request) {
	caller := auth.UserFrom(r.Context())
	if caller == nil || auth.IsSynthetic(caller) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	var p mountOrderPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if len(p.MountIDs) > 10000 {
		http.Error(w, "too many mount ids", http.StatusBadRequest)
		return
	}
	seen := make(map[int64]struct{}, len(p.MountIDs))
	for _, id := range p.MountIDs {
		if id <= 0 {
			http.Error(w, "invalid mount id", http.StatusBadRequest)
			return
		}
		if _, duplicate := seen[id]; duplicate {
			http.Error(w, "duplicate mount id", http.StatusBadRequest)
			return
		}
		seen[id] = struct{}{}
	}
	raw, err := json.Marshal(p.MountIDs)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if err := h.Repo.SetMountOrder(r.Context(), caller.ID, string(raw)); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func validLayoutFolderID(id string) bool {
	if id == "" || len(id) > 64 {
		return false
	}
	for _, char := range id {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') || char == '-' || char == '_' {
			continue
		}
		return false
	}
	return true
}

func (h *UsersHandler) UpdateMyMountLayout(w http.ResponseWriter, r *http.Request) {
	caller := auth.UserFrom(r.Context())
	if caller == nil || auth.IsSynthetic(caller) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	var layout models.MountLayout
	if err := json.NewDecoder(r.Body).Decode(&layout); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if len(layout.Items) > 10000 {
		http.Error(w, "too many layout items", http.StatusBadRequest)
		return
	}
	seenMounts := make(map[int64]struct{})
	seenFolders := make(map[string]struct{})
	for index := range layout.Items {
		item := &layout.Items[index]
		switch item.Type {
		case "mount":
			if item.MountID <= 0 {
				http.Error(w, "invalid mount id", http.StatusBadRequest)
				return
			}
			if _, duplicate := seenMounts[item.MountID]; duplicate {
				http.Error(w, "duplicate mount id", http.StatusBadRequest)
				return
			}
			seenMounts[item.MountID] = struct{}{}
			item.ID, item.Name, item.Icon, item.AvatarColor, item.MountIDs = "", "", "", "", nil
			item.HasAvatarImage = false
		case "folder":
			item.ID = strings.TrimSpace(item.ID)
			item.Name = strings.TrimSpace(item.Name)
			item.Icon = strings.TrimSpace(item.Icon)
			item.AvatarColor = strings.TrimSpace(item.AvatarColor)
			item.HasAvatarImage = false
			if !validLayoutFolderID(item.ID) || item.Name == "" || len(item.Name) > 80 ||
				len(item.Icon) > 32 || len(item.AvatarColor) > 64 {
				http.Error(w, "invalid folder", http.StatusBadRequest)
				return
			}
			if _, duplicate := seenFolders[item.ID]; duplicate {
				http.Error(w, "duplicate folder id", http.StatusBadRequest)
				return
			}
			seenFolders[item.ID] = struct{}{}
			if len(item.MountIDs) > 10000 {
				http.Error(w, "too many folder mounts", http.StatusBadRequest)
				return
			}
			for _, mountID := range item.MountIDs {
				if mountID <= 0 {
					http.Error(w, "invalid mount id", http.StatusBadRequest)
					return
				}
				if _, duplicate := seenMounts[mountID]; duplicate {
					http.Error(w, "duplicate mount id", http.StatusBadRequest)
					return
				}
				seenMounts[mountID] = struct{}{}
			}
			item.MountID = 0
		default:
			http.Error(w, "invalid layout item type", http.StatusBadRequest)
			return
		}
	}
	raw, err := json.Marshal(layout)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if err := h.Repo.SetMountLayout(r.Context(), caller.ID, string(raw)); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if avatarIDs, err := h.Repo.MountFolderAvatarIDs(r.Context(), caller.ID); err == nil {
		for folderID := range avatarIDs {
			if _, exists := seenFolders[folderID]; !exists {
				_ = h.Repo.ClearMountFolderAvatar(r.Context(), caller.ID, folderID)
				delete(avatarIDs, folderID)
			}
		}
		for index := range layout.Items {
			if layout.Items[index].Type == "folder" {
				layout.Items[index].HasAvatarImage = avatarIDs[layout.Items[index].ID]
			}
		}
	}
	writeJSON(w, http.StatusOK, layout)
}

func callerMountFolder(r *http.Request) (*models.User, string, bool) {
	caller := auth.UserFrom(r.Context())
	if caller == nil || auth.IsSynthetic(caller) {
		return caller, "", false
	}
	folderID := chi.URLParam(r, "folderId")
	if !validLayoutFolderID(folderID) {
		return caller, folderID, false
	}
	var layout models.MountLayout
	if json.Unmarshal([]byte(caller.MountLayout), &layout) != nil {
		return caller, folderID, false
	}
	for _, item := range layout.Items {
		if item.Type == "folder" && item.ID == folderID {
			return caller, folderID, true
		}
	}
	return caller, folderID, false
}

func (h *UsersHandler) GetMyMountFolderAvatar(w http.ResponseWriter, r *http.Request) {
	caller, folderID, ok := callerMountFolder(r)
	if !ok {
		http.NotFound(w, r)
		return
	}
	data, contentType, err := h.Repo.MountFolderAvatar(r.Context(), caller.ID, folderID)
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

func (h *UsersHandler) UploadMyMountFolderAvatar(w http.ResponseWriter, r *http.Request) {
	caller, folderID, ok := callerMountFolder(r)
	if !ok {
		http.NotFound(w, r)
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
	if err := h.Repo.SetMountFolderAvatar(r.Context(), caller.ID, folderID, data, contentType); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *UsersHandler) DeleteMyMountFolderAvatar(w http.ResponseWriter, r *http.Request) {
	caller, folderID, ok := callerMountFolder(r)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if err := h.Repo.ClearMountFolderAvatar(r.Context(), caller.ID, folderID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *UsersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	if err := h.Repo.DeleteAtomic(r.Context(), id); err != nil {
		if errors.Is(err, repositories.ErrLastActiveAdmin) {
			http.Error(w, "the last active administrator cannot be deleted", http.StatusConflict)
			return
		}
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type addToGroupPayload struct {
	GroupID int64 `json:"group_id"`
}

type replaceGroupsPayload struct {
	GroupIDs *[]int64 `json:"group_ids"`
}

func (h *UsersHandler) ReplaceGroups(w http.ResponseWriter, r *http.Request) {
	uid, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var p replaceGroupsPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if p.GroupIDs == nil {
		http.Error(w, "group_ids is required", http.StatusBadRequest)
		return
	}
	if err := h.Repo.ReplaceGroups(r.Context(), uid, *p.GroupIDs); err != nil {
		if errors.Is(err, db.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if db.IsForeignKeyViolation(err) || db.IsUniqueViolation(err) {
			http.Error(w, "invalid group_ids", http.StatusBadRequest)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *UsersHandler) AddToGroup(w http.ResponseWriter, r *http.Request) {
	uid, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var p addToGroupPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if err := h.Repo.AddGroup(r.Context(), uid, p.GroupID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *UsersHandler) RemoveFromGroup(w http.ResponseWriter, r *http.Request) {
	uid, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	gid, err := strconv.ParseInt(chi.URLParam(r, "groupId"), 10, 64)
	if err != nil {
		http.Error(w, "bad group id", http.StatusBadRequest)
		return
	}
	if err := h.Repo.RemoveGroup(r.Context(), uid, gid); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
