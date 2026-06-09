package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/mountpad/mountpad/internal/models"
	"github.com/mountpad/mountpad/internal/repositories"
)

type GroupsHandler struct{ Repo *repositories.GroupsRepo }

func NewGroupsHandler(r *repositories.GroupsRepo) *GroupsHandler { return &GroupsHandler{Repo: r} }

func (h *GroupsHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.Repo.List(r.Context())
	if err != nil { http.Error(w, "internal error", http.StatusInternalServerError); return }
	writeJSON(w, http.StatusOK, list)
}

// Directory is the equivalent of UsersHandler.Directory for groups: id+name
// only, safe for any authenticated user to read.
type groupDirectoryEntry struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

func (h *GroupsHandler) Directory(w http.ResponseWriter, r *http.Request) {
	list, err := h.Repo.List(r.Context())
	if err != nil { http.Error(w, "internal error", http.StatusInternalServerError); return }
	out := make([]groupDirectoryEntry, 0, len(list))
	for _, g := range list {
		out = append(out, groupDirectoryEntry{ID: g.ID, Name: g.Name})
	}
	writeJSON(w, http.StatusOK, out)
}

// groupPayload uses pointers for the optional fields so callers can update
// just one (e.g. only the color from the avatar picker) without clobbering
// the rest.
type groupPayload struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	AvatarColor *string `json:"avatar_color,omitempty"`
}

func (h *GroupsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var p groupPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	if p.Name == nil || *p.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest); return
	}
	g := &models.Group{Name: *p.Name}
	if p.Description != nil { g.Description = *p.Description }
	if p.AvatarColor != nil { g.AvatarColor = *p.AvatarColor }
	if err := h.Repo.Create(r.Context(), g); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError); return
	}
	writeJSON(w, http.StatusCreated, g)
}

func (h *GroupsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil { http.Error(w, "bad id", http.StatusBadRequest); return }
	g, err := h.Repo.GetByID(r.Context(), id)
	if err != nil { http.Error(w, "not found", http.StatusNotFound); return }
	var p groupPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	if p.Name != nil && *p.Name != "" { g.Name = *p.Name }
	if p.Description != nil { g.Description = *p.Description }
	if p.AvatarColor != nil { g.AvatarColor = *p.AvatarColor }
	if err := h.Repo.Update(r.Context(), g); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError); return
	}
	writeJSON(w, http.StatusOK, g)
}

func (h *GroupsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil { http.Error(w, "bad id", http.StatusBadRequest); return }
	if err := h.Repo.Delete(r.Context(), id); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError); return
	}
	w.WriteHeader(http.StatusNoContent)
}
