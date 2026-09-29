package handlers

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"syscall"

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
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
	rel := r.URL.Query().Get("path")
	if err := h.FS.rejectManifest(rel, user.IsAdmin); err != nil {
		h.FS.writeError(w, err)
		return
	}
	rp, err := h.FS.resolve(r, mp, rel)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}

	isDir := true
	if info, err := os.Lstat(rp.Absolute); err == nil {
		isDir = info.IsDir()
	}
	if err := h.Resolver.Check(user, mountpoints.MountContext(mp), rp.Absolute, isDir, acl.ActionRead); err != nil {
		h.FS.writeError(w, err)
		return
	}

	eff, err := h.Resolver.Resolve(mountpoints.MountContext(mp), rp.Absolute)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
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
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if p.Mode != nil && *p.Mode > 0o777 {
		http.Error(w, "mode must be between 000 and 0777", http.StatusBadRequest)
		return
	}
	mp, err := h.FS.loadMount(r)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
	if err := h.FS.rejectManifest(p.Path, user.IsAdmin); err != nil {
		h.FS.writeError(w, err)
		return
	}
	rp, err := h.FS.resolve(r, mp, p.Path)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
	if err := h.Resolver.Check(user, mountpoints.MountContext(mp), rp.Absolute, true, acl.ActionChmod); err != nil {
		h.FS.writeError(w, err)
		return
	}
	h.upsert(w, mp, rp.Absolute, func(e *manifests.Entry) {
		if p.Mode != nil {
			e.Mode = *p.Mode
		}
	})
}

type chownPayload struct {
	Path    string `json:"path"`
	OwnerID *int64 `json:"owner_id"`
}

// PATCH /api/fs/{mountId}/owner  (admin only)
func (h *ACLHandler) Chown(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	if !user.IsAdmin {
		h.FS.writeError(w, acl.ErrDenied)
		return
	}
	var p chownPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	mp, err := h.FS.loadMount(r)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
	if err := h.FS.rejectManifest(p.Path, true); err != nil {
		h.FS.writeError(w, err)
		return
	}
	rp, err := h.FS.resolve(r, mp, p.Path)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
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
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	mp, err := h.FS.loadMount(r)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
	if err := h.FS.rejectManifest(p.Path, user.IsAdmin); err != nil {
		h.FS.writeError(w, err)
		return
	}
	rp, err := h.FS.resolve(r, mp, p.Path)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
	if err := h.Resolver.Check(user, mountpoints.MountContext(mp), rp.Absolute, true, acl.ActionChown); err != nil {
		h.FS.writeError(w, err)
		return
	}
	h.upsert(w, mp, rp.Absolute, func(e *manifests.Entry) {
		e.GroupID = p.GroupID
	})
}

type systemPermissionsPayload struct {
	Path string  `json:"path"`
	Mode *uint32 `json:"mode"`
	UID  *int64  `json:"uid"`
	GID  *int64  `json:"gid"`
}

// GET /api/fs/{mountId}/system-permissions?path=...
// Host ownership is intentionally admin-only: numeric UID/GID values belong
// to the container/host security boundary, not MountPad's logical ACL model.
func (h *ACLHandler) GetSystemPermissions(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	if user == nil || !user.IsAdmin {
		h.FS.writeError(w, acl.ErrDenied)
		return
	}
	mp, err := h.FS.loadMount(r)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
	rel := r.URL.Query().Get("path")
	if err := h.FS.rejectManifest(rel, true); err != nil {
		h.FS.writeError(w, err)
		return
	}
	rp, err := filesystem.Resolve(mp.HostPath, rel, false)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
	h.writeSystemPermissions(w, rp)
}

// PUT /api/fs/{mountId}/system-permissions
func (h *ACLHandler) SetSystemPermissions(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	if user == nil || !user.IsAdmin {
		h.FS.writeError(w, acl.ErrDenied)
		return
	}
	var p systemPermissionsPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if p.Mode == nil || p.UID == nil || p.GID == nil {
		http.Error(w, "mode, uid, and gid are required", http.StatusBadRequest)
		return
	}
	if *p.Mode > 0o777 {
		http.Error(w, "mode must be between 000 and 0777", http.StatusBadRequest)
		return
	}
	const maxSystemID = int64(1<<31 - 1)
	if *p.UID < 0 || *p.UID > maxSystemID || *p.GID < 0 || *p.GID > maxSystemID {
		http.Error(w, "uid and gid must be between 0 and 2147483647", http.StatusBadRequest)
		return
	}
	mp, err := h.FS.loadMount(r)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
	if err := h.FS.rejectManifest(p.Path, true); err != nil {
		h.FS.writeError(w, err)
		return
	}
	rp, err := filesystem.Resolve(mp.HostPath, p.Path, false)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
	info, err := os.Lstat(rp.Absolute)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
	if info.Mode()&os.ModeSymlink != 0 {
		h.FS.writeError(w, filesystem.ErrSymlinkNotAllowed)
		return
	}
	if err := os.Chown(rp.Absolute, int(*p.UID), int(*p.GID)); err != nil {
		h.writeHostMutationError(w, err)
		return
	}
	if err := os.Chmod(rp.Absolute, os.FileMode(*p.Mode)); err != nil {
		h.writeHostMutationError(w, err)
		return
	}
	h.writeSystemPermissions(w, rp)
}

func (h *ACLHandler) writeSystemPermissions(w http.ResponseWriter, rp *filesystem.ResolvedPath) {
	info, err := os.Lstat(rp.Absolute)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
	if info.Mode()&os.ModeSymlink != 0 {
		h.FS.writeError(w, filesystem.ErrSymlinkNotAllowed)
		return
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		http.Error(w, "host metadata unavailable", http.StatusNotImplemented)
		return
	}
	mode := uint32(info.Mode().Perm())
	writeJSON(w, http.StatusOK, map[string]any{
		"path":     rp.Relative,
		"uid":      uint64(stat.Uid),
		"gid":      uint64(stat.Gid),
		"mode":     mode,
		"mode_str": acl.FormatMode(uint16(mode)),
	})
}

func (h *ACLHandler) writeHostMutationError(w http.ResponseWriter, err error) {
	if errors.Is(err, fs.ErrPermission) {
		http.Error(w, "host permission denied; the MountPad process lacks chmod/chown privileges", http.StatusForbidden)
		return
	}
	h.FS.writeError(w, err)
}

// upsert reads the current effective entry for absPath, applies the mutator,
// and persists the result in the parent directory's manifest. This is the
// ONE place where a manifest may be created on disk (lazy materialisation).
func (h *ACLHandler) upsert(w http.ResponseWriter, mp *models.MountPoint, absPath string, mutate func(*manifests.Entry)) {
	parent := filepath.Dir(absPath)
	base := filepath.Base(absPath)

	info, err := os.Lstat(absPath)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}
	if info.Mode()&os.ModeSymlink != 0 {
		h.FS.writeError(w, filesystem.ErrSymlinkNotAllowed)
		return
	}

	eff, err := h.Resolver.Resolve(mountpoints.MountContext(mp), absPath)
	if err != nil {
		h.FS.writeError(w, err)
		return
	}

	entry := manifests.Entry{
		Type:    entryType(info),
		OwnerID: eff.OwnerID,
		GroupID: eff.GroupID,
		Mode:    eff.Mode,
	}
	mutate(&entry)
	if err := h.Manifest.UpsertEntry(parent, base, entry); err != nil {
		h.FS.writeError(w, err)
		return
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
	if info.IsDir() {
		return manifests.EntryDir
	}
	return manifests.EntryFile
}
