package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/mountpad/mountpad/internal/acl"
	"github.com/mountpad/mountpad/internal/auth"
	"github.com/mountpad/mountpad/internal/config"
	"github.com/mountpad/mountpad/internal/db"
	"github.com/mountpad/mountpad/internal/filesystem"
	"github.com/mountpad/mountpad/internal/manifests"
	"github.com/mountpad/mountpad/internal/models"
	"github.com/mountpad/mountpad/internal/mountpoints"
	"github.com/mountpad/mountpad/internal/repositories"
)

type FSHandler struct {
	Cfg       *config.Config
	Mounts    *repositories.MountPointsRepo
	Manifest  *manifests.Store
	Resolver  *acl.Resolver
}

func NewFSHandler(cfg *config.Config, m *repositories.MountPointsRepo, mf *manifests.Store, r *acl.Resolver) *FSHandler {
	return &FSHandler{Cfg: cfg, Mounts: m, Manifest: mf, Resolver: r}
}

// ---- helpers ----

func (h *FSHandler) loadMount(r *http.Request) (*models.MountPoint, error) {
	idStr := chi.URLParam(r, "mountId")
	if id, err := strconv.ParseInt(idStr, 10, 64); err == nil {
		mp, err := h.Mounts.GetByID(r.Context(), id)
		if err == nil {
			return mp, nil
		}
		if !errors.Is(err, db.ErrNotFound) {
			return nil, err
		}
	}
	return h.Mounts.GetBySlug(r.Context(), idStr)
}

func (h *FSHandler) resolve(r *http.Request, mp *models.MountPoint, userRel string) (*filesystem.ResolvedPath, error) {
	return filesystem.Resolve(mp.HostPath, userRel, h.Cfg.AllowSymlinks)
}

func (h *FSHandler) writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, acl.ErrDenied):
		http.Error(w, "permission denied", http.StatusForbidden)
	case errors.Is(err, filesystem.ErrPathTraversal),
		errors.Is(err, filesystem.ErrOutsideMount),
		errors.Is(err, filesystem.ErrInvalidPath):
		http.Error(w, "invalid path", http.StatusBadRequest)
	case errors.Is(err, filesystem.ErrSymlinkNotAllowed):
		http.Error(w, "symlink not allowed", http.StatusForbidden)
	case errors.Is(err, filesystem.ErrNotFound):
		http.Error(w, "not found", http.StatusNotFound)
	case errors.Is(err, filesystem.ErrAlreadyExists):
		http.Error(w, "already exists", http.StatusConflict)
	case errors.Is(err, filesystem.ErrConflict):
		http.Error(w, "conflict", http.StatusConflict)
	case errors.Is(err, filesystem.ErrFileTooLarge):
		http.Error(w, "file too large", http.StatusRequestEntityTooLarge)
	case errors.Is(err, filesystem.ErrBinaryFile):
		http.Error(w, "binary file", http.StatusUnsupportedMediaType)
	case errors.Is(err, filesystem.ErrNotEmpty):
		http.Error(w, "directory not empty", http.StatusConflict)
	case errors.Is(err, filesystem.ErrManifestProtected):
		http.Error(w, "manifest protected", http.StatusForbidden)
	default:
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

// rejectManifest ensures the user-provided relative path does NOT target a
// manifest file or the app-internal `.mountpad` directory, unless the
// admin/debug flag is on. ALL path segments are inspected (not just the
// basename) to block requests like ".mountpad/mountpad.db".
func (h *FSHandler) rejectManifest(rel string, isAdmin bool) error {
	if h.Cfg.ShowManifests && isAdmin {
		return nil
	}
	cleaned := strings.Trim(filepath.ToSlash(rel), "/")
	if cleaned == "" {
		return nil
	}
	for _, seg := range strings.Split(cleaned, "/") {
		if seg == h.Cfg.ManifestFilename {
			return filesystem.ErrManifestProtected
		}
		if strings.HasPrefix(seg, ".mountpad.acl.") && strings.HasSuffix(seg, ".tmp") {
			return filesystem.ErrManifestProtected
		}
		if seg == ".mountpad" {
			return filesystem.ErrManifestProtected
		}
	}
	return nil
}

// decorate enriches a list of disk entries with ACL-resolved metadata.
func (h *FSHandler) decorate(ctx context.Context, mp *models.MountPoint, dirAbs string, entries []filesystem.DirEntry) []models.FileEntry {
	out := make([]models.FileEntry, 0, len(entries))
	mc := mountpoints.MountContext(mp)
	for _, e := range entries {
		full := filepath.Join(dirAbs, e.Name)
		eff, err := h.Resolver.Resolve(mc, full)
		if err != nil {
			continue
		}
		out = append(out, models.FileEntry{
			Name:       e.Name,
			Path:       relativeTo(mp.HostPath, full),
			IsDir:      e.IsDir,
			Size:       e.Size,
			ModifiedAt: e.ModifiedAt,
			OwnerID:    eff.OwnerID,
			GroupID:    eff.GroupID,
			Mode:       eff.Mode,
			HasManifest: eff.Source == "manifest",
		})
	}
	return out
}

func relativeTo(root, p string) string {
	rel, err := filepath.Rel(root, p)
	if err != nil || rel == "." {
		return ""
	}
	return filepath.ToSlash(rel)
}

// ---- endpoints ----

// GET /api/fs/{mountId}/list?path=...
func (h *FSHandler) List(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	mp, err := h.loadMount(r)
	if err != nil {
		h.writeError(w, err)
		return
	}
	rp, err := h.resolve(r, mp, r.URL.Query().Get("path"))
	if err != nil {
		h.writeError(w, err)
		return
	}
	if err := h.Resolver.Check(user, mountpoints.MountContext(mp), rp.Absolute, true, acl.ActionList); err != nil {
		h.writeError(w, err)
		return
	}

	showManifests := h.Cfg.ShowManifests && user.IsAdmin
	entries, err := filesystem.ListDir(rp.Absolute, h.Cfg.ManifestFilename, showManifests)
	if err != nil {
		h.writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"mount_id": mp.ID,
		"mount_slug": mp.Slug,
		"path":     rp.Relative,
		"entries":  h.decorate(r.Context(), mp, rp.Absolute, entries),
	})
}

// GET /api/fs/{mountId}/read?path=...
func (h *FSHandler) Read(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	mp, err := h.loadMount(r)
	if err != nil { h.writeError(w, err); return }
	rel := r.URL.Query().Get("path")
	if err := h.rejectManifest(rel, user.IsAdmin); err != nil {
		h.writeError(w, err); return
	}
	rp, err := h.resolve(r, mp, rel)
	if err != nil { h.writeError(w, err); return }
	if err := h.Resolver.Check(user, mountpoints.MountContext(mp), rp.Absolute, false, acl.ActionRead); err != nil {
		h.writeError(w, err); return
	}

	res, err := filesystem.ReadFile(rp.Absolute, h.Cfg.MaxEditableFileSize)
	if err != nil { h.writeError(w, err); return }
	if res.IsBinary {
		writeJSON(w, http.StatusOK, map[string]any{
			"path": rp.Relative, "is_binary": true,
			"size": len(res.Content), "modified_at": res.ModifiedAt,
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":        rp.Relative,
		"content":     string(res.Content),
		"checksum":    res.Checksum,
		"modified_at": res.ModifiedAt,
		"is_binary":   false,
	})
}

type writePayload struct {
	Path             string    `json:"path"`
	Content          string    `json:"content"`
	ExpectedChecksum string    `json:"expected_checksum"`
	ExpectedMTime    time.Time `json:"expected_mtime"`
}

// PUT /api/fs/{mountId}/write
func (h *FSHandler) Write(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	var p writePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	mp, err := h.loadMount(r); if err != nil { h.writeError(w, err); return }
	if err := h.rejectManifest(p.Path, user.IsAdmin); err != nil { h.writeError(w, err); return }
	rp, err := h.resolve(r, mp, p.Path); if err != nil { h.writeError(w, err); return }
	if err := h.Resolver.Check(user, mountpoints.MountContext(mp), rp.Absolute, false, acl.ActionWrite); err != nil {
		h.writeError(w, err); return
	}
	if int64(len(p.Content)) > h.Cfg.MaxEditableFileSize {
		h.writeError(w, filesystem.ErrFileTooLarge); return
	}
	res, err := filesystem.WriteFileAtomic(rp.Absolute, []byte(p.Content), filesystem.WriteOptions{
		ExpectedChecksum: p.ExpectedChecksum,
		ExpectedMTime:    p.ExpectedMTime,
	})
	if err != nil { h.writeError(w, err); return }
	writeJSON(w, http.StatusOK, map[string]any{
		"checksum": res.Checksum, "modified_at": res.ModifiedAt,
	})
}

type createPayload struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// POST /api/fs/{mountId}/file
func (h *FSHandler) CreateFile(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	var p createPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	mp, err := h.loadMount(r); if err != nil { h.writeError(w, err); return }
	if err := h.rejectManifest(p.Path, user.IsAdmin); err != nil { h.writeError(w, err); return }
	rp, err := h.resolve(r, mp, p.Path); if err != nil { h.writeError(w, err); return }

	parentAbs := filepath.Dir(rp.Absolute)
	if err := h.Resolver.Check(user, mountpoints.MountContext(mp), parentAbs, true, acl.ActionCreate); err != nil {
		h.writeError(w, err); return
	}
	res, err := filesystem.WriteFileAtomic(rp.Absolute, []byte(p.Content), filesystem.WriteOptions{CreateOnly: true})
	if err != nil { h.writeError(w, err); return }
	writeJSON(w, http.StatusCreated, map[string]any{
		"path": rp.Relative, "checksum": res.Checksum, "modified_at": res.ModifiedAt,
	})
}

// POST /api/fs/{mountId}/directory
func (h *FSHandler) CreateDir(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	var p createPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	mp, err := h.loadMount(r); if err != nil { h.writeError(w, err); return }
	rp, err := h.resolve(r, mp, p.Path); if err != nil { h.writeError(w, err); return }
	parentAbs := filepath.Dir(rp.Absolute)
	if err := h.Resolver.Check(user, mountpoints.MountContext(mp), parentAbs, true, acl.ActionCreate); err != nil {
		h.writeError(w, err); return
	}
	if err := filesystem.CreateDir(rp.Absolute, false); err != nil { h.writeError(w, err); return }
	writeJSON(w, http.StatusCreated, map[string]any{"path": rp.Relative})
}

type renamePayload struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// PATCH /api/fs/{mountId}/rename
func (h *FSHandler) Rename(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	var p renamePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	mp, err := h.loadMount(r); if err != nil { h.writeError(w, err); return }
	if err := h.rejectManifest(p.From, user.IsAdmin); err != nil { h.writeError(w, err); return }
	if err := h.rejectManifest(p.To, user.IsAdmin); err != nil { h.writeError(w, err); return }
	src, err := h.resolve(r, mp, p.From); if err != nil { h.writeError(w, err); return }
	dst, err := h.resolve(r, mp, p.To); if err != nil { h.writeError(w, err); return }

	mc := mountpoints.MountContext(mp)
	if err := h.Resolver.Check(user, mc, filepath.Dir(src.Absolute), true, acl.ActionDelete); err != nil {
		h.writeError(w, err); return
	}
	if err := h.Resolver.Check(user, mc, filepath.Dir(dst.Absolute), true, acl.ActionCreate); err != nil {
		h.writeError(w, err); return
	}
	if err := filesystem.Rename(src.Absolute, dst.Absolute); err != nil { h.writeError(w, err); return }

	// Carry over the manifest entry if it existed, then drop the source row.
	if mfSrc, ok, _ := h.Manifest.Load(filepath.Dir(src.Absolute)); ok {
		base := filepath.Base(src.Absolute)
		if entry, present := mfSrc.Entries[base]; present {
			_ = h.Manifest.UpsertEntry(filepath.Dir(dst.Absolute), filepath.Base(dst.Absolute), entry)
			_ = h.Manifest.DeleteEntry(filepath.Dir(src.Absolute), base)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"from": src.Relative, "to": dst.Relative})
}

type deletePayload struct {
	Path string `json:"path"`
}

// DELETE /api/fs/{mountId}/delete
func (h *FSHandler) Delete(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	var p deletePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	mp, err := h.loadMount(r); if err != nil { h.writeError(w, err); return }
	if err := h.rejectManifest(p.Path, user.IsAdmin); err != nil { h.writeError(w, err); return }
	rp, err := h.resolve(r, mp, p.Path); if err != nil { h.writeError(w, err); return }

	mc := mountpoints.MountContext(mp)
	if err := h.Resolver.Check(user, mc, filepath.Dir(rp.Absolute), true, acl.ActionDelete); err != nil {
		h.writeError(w, err); return
	}

	info, err := os.Lstat(rp.Absolute)
	if err != nil { h.writeError(w, err); return }
	base := filepath.Base(rp.Absolute)

	if info.IsDir() {
		if err := filesystem.DeleteDirSimple(rp.Absolute, h.Cfg.ManifestFilename); err != nil {
			h.writeError(w, err); return
		}
	} else {
		if err := filesystem.DeleteFile(rp.Absolute); err != nil { h.writeError(w, err); return }
	}
	_ = h.Manifest.DeleteEntry(filepath.Dir(rp.Absolute), base)
	writeJSON(w, http.StatusOK, map[string]any{"deleted": rp.Relative})
}

// DELETE /api/fs/{mountId}/deep-delete
func (h *FSHandler) DeepDelete(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	var p deletePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}
	mp, err := h.loadMount(r); if err != nil { h.writeError(w, err); return }
	if err := h.rejectManifest(p.Path, user.IsAdmin); err != nil { h.writeError(w, err); return }
	rp, err := h.resolve(r, mp, p.Path); if err != nil { h.writeError(w, err); return }
	if rp.IsMountRoot {
		h.writeError(w, acl.ErrDenied); return
	}

	mc := mountpoints.MountContext(mp)
	if err := h.Resolver.Check(user, mc, filepath.Dir(rp.Absolute), true, acl.ActionDelete); err != nil {
		h.writeError(w, err); return
	}

	walkErr := filesystem.Walk(rp.Absolute, func(p string, info os.FileInfo) error {
		return h.Resolver.Check(user, mc, p, info.IsDir(), acl.ActionDelete)
	})
	if walkErr != nil { h.writeError(w, walkErr); return }

	if err := filesystem.DeleteDirRecursive(rp.Absolute); err != nil { h.writeError(w, err); return }
	_ = h.Manifest.DeleteEntry(filepath.Dir(rp.Absolute), filepath.Base(rp.Absolute))
	writeJSON(w, http.StatusOK, map[string]any{"deep_deleted": rp.Relative})
}
