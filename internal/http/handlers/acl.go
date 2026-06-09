package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"

	"github.com/mountpad/mountpad/internal/acl"
	"github.com/mountpad/mountpad/internal/auth"
	"github.com/mountpad/mountpad/internal/config"
	"github.com/mountpad/mountpad/internal/filesystem"
	"github.com/mountpad/mountpad/internal/manifests"
	"github.com/mountpad/mountpad/internal/models"
	"github.com/mountpad/mountpad/internal/mountpoints"
	"github.com/mountpad/mountpad/internal/repositories"
)

type ACLHandler struct {
	Cfg      *config.Config
	Mounts   *repositories.MountPointsRepo
	Manifest *manifests.Store
	Resolver *acl.Resolver
	FS       *FSHandler
}

func NewACLHandler(cfg *config.Config, m *repositories.MountPointsRepo, mf *manifests.Store, r *acl.Resolver, fs *FSHandler) *ACLHandler {
	return &ACLHandler{Cfg: cfg, Mounts: m, Manifest: mf, Resolver: r, FS: fs}
}

// GET /api/fs/{mountId}/acl?path=...
func (h *ACLHandler) Get(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	mp, err := h.FS.loadMount(r)
	if err != nil { h.FS.writeError(w, err); return }
	rel := r.URL.Query().Get("path")
	if err := h.FS.rejectManifest(rel, user.IsAdmin); err != nil { h.FS.writeError(w, err); return }
	rp, err := h.FS.resolve(r, mp, rel)
	if err != nil { h.FS.writeError(w, err); return }

	isDir := true
	if info, err := os.Lstat(rp.Absolute); err == nil { isDir = info.IsDir() }
	if err := h.Resolver.Check(user, mountpoints.MountContext(mp), rp.Absolute, isDir, acl.ActionRead); err != nil {
		h.FS.writeError(w, err); return
	}

	eff, err := h.Resolver.Resolve(mountpoints.MountContext(mp), rp.Absolute)
	if err != nil { h.FS.writeError(w, err); return }
	writeJSON(w, http.StatusOK, map[string]any{
		"path":     rp.Relative,
		"owner_id": eff.OwnerID,
		"group_id": eff.GroupID,
		"mode":     eff.Mode,
		"mode_str": acl.FormatMode(eff.Mode),
		"source":   eff.Source,
	})
}

type setACLPayload struct {
	Path string  `json:"path"`
	Mode *uint16 `json:"mode,omitempty"`
}

// PUT /api/fs/{mountId}/acl  (mode only)
func (h *ACLHandler) Set(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	var p setACLPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	mp, err := h.FS.loadMount(r); if err != nil { h.FS.writeError(w, err); return }
	if err := h.FS.rejectManifest(p.Path, user.IsAdmin); err != nil { h.FS.writeError(w, err); return }
	rp, err := h.FS.resolve(r, mp, p.Path); if err != nil { h.FS.writeError(w, err); return }
	if err := h.Resolver.Check(user, mountpoints.MountContext(mp), rp.Absolute, true, acl.ActionChmod); err != nil {
		h.FS.writeError(w, err); return
	}
	h.upsert(w, mp, rp.Absolute, func(e *manifests.Entry) {
		if p.Mode != nil { e.Mode = *p.Mode & 0o777 }
	})
}

type chownPayload struct {
	Path    string `json:"path"`
	OwnerID *int64 `json:"owner_id"`
}

// PATCH /api/fs/{mountId}/owner  (admin only)
func (h *ACLHandler) Chown(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	if !user.IsAdmin { h.FS.writeError(w, acl.ErrDenied); return }
	var p chownPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	mp, err := h.FS.loadMount(r); if err != nil { h.FS.writeError(w, err); return }
	if err := h.FS.rejectManifest(p.Path, true); err != nil { h.FS.writeError(w, err); return }
	rp, err := h.FS.resolve(r, mp, p.Path); if err != nil { h.FS.writeError(w, err); return }
	h.upsert(w, mp, rp.Absolute, func(e *manifests.Entry) {
		e.OwnerID = p.OwnerID
	})
}

type chgrpPayload struct {
	Path    string `json:"path"`
	GroupID *int64 `json:"group_id"`
}

// PATCH /api/fs/{mountId}/group  (owner or admin)
func (h *ACLHandler) Chgrp(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	var p chgrpPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	mp, err := h.FS.loadMount(r); if err != nil { h.FS.writeError(w, err); return }
	if err := h.FS.rejectManifest(p.Path, user.IsAdmin); err != nil { h.FS.writeError(w, err); return }
	rp, err := h.FS.resolve(r, mp, p.Path); if err != nil { h.FS.writeError(w, err); return }
	if err := h.Resolver.Check(user, mountpoints.MountContext(mp), rp.Absolute, true, acl.ActionChown); err != nil {
		h.FS.writeError(w, err); return
	}
	h.upsert(w, mp, rp.Absolute, func(e *manifests.Entry) {
		e.GroupID = p.GroupID
	})
}

// upsert reads the current effective entry for absPath, applies the mutator,
// and persists the result in the parent directory's manifest. This is the
// ONE place where a manifest may be created on disk (lazy materialisation).
func (h *ACLHandler) upsert(w http.ResponseWriter, mp *models.MountPoint, absPath string, mutate func(*manifests.Entry)) {
	parent := filepath.Dir(absPath)
	base := filepath.Base(absPath)

	info, err := os.Lstat(absPath)
	if err != nil { h.FS.writeError(w, err); return }
	if info.Mode()&os.ModeSymlink != 0 { h.FS.writeError(w, filesystem.ErrSymlinkNotAllowed); return }

	eff, err := h.Resolver.Resolve(mountpoints.MountContext(mp), absPath)
	if err != nil { h.FS.writeError(w, err); return }

	entry := manifests.Entry{
		Type:    entryType(info),
		OwnerID: eff.OwnerID,
		GroupID: eff.GroupID,
		Mode:    eff.Mode,
	}
	mutate(&entry)
	if err := h.Manifest.UpsertEntry(parent, base, entry); err != nil {
		h.FS.writeError(w, err); return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":     filepath.ToSlash(filepath.Join(filepath.Base(filepath.Dir(absPath)), base)),
		"owner_id": entry.OwnerID,
		"group_id": entry.GroupID,
		"mode":     entry.Mode,
		"mode_str": acl.FormatMode(entry.Mode),
	})
}

func entryType(info os.FileInfo) manifests.EntryType {
	if info.IsDir() { return manifests.EntryDir }
	return manifests.EntryFile
}
