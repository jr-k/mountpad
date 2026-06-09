package handlers

import (
	"archive/zip"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
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
	return filesystem.Resolve(mp.HostPath, userRel, h.followSymlinks(mp))
}

// followSymlinks returns the effective symlink policy for a given
// mount: the global MOUNTPAD_FOLLOW_SYMLINK env var ANDed with the
// per-mount `follow_symlinks` column. The global flag is restrictive
// (when it's off, no mount can opt back in) so an admin can run a
// safe-by-default deployment AND still grant a per-mount escape
// hatch via the env var, while keeping individual user-writable
// mounts locked down through their own column.
func (h *FSHandler) followSymlinks(mp *models.MountPoint) bool {
	if mp == nil {
		return h.Cfg.FollowSymlinks
	}
	return h.Cfg.FollowSymlinks && mp.FollowSymlinks
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
// manifest file or the legacy `.mountpad` directory, unless the
// admin/debug flag is on. ALL path segments are inspected (not just the
// basename) to block requests like ".mountpad/anything" - kept as a
// defensive guard for upgraded installs that may still have a stray
// `.mountpad/` folder left over from when the SQLite DB lived under
// /storage.
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
			IsSymlink:  e.IsSymlink,
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

	// Lstat alongside the read so the response can carry an
	// `is_symlink` flag. The frontend uses it to flip the text
	// editor into read-only mode (with an explanatory banner)
	// since the write endpoint refuses to mutate through a symlink
	// for safety - editing one would unexpectedly clobber whatever
	// the link points to.
	linkInfo, _ := os.Lstat(rp.Absolute)
	isSymlink := linkInfo != nil && linkInfo.Mode()&os.ModeSymlink != 0

	res, err := filesystem.ReadFile(rp.Absolute, h.Cfg.MaxEditableFileSize)
	if err != nil { h.writeError(w, err); return }
	if res.IsBinary {
		// Cap the hex-preview payload so a 4 MiB binary doesn't ship
		// ~5.4 MiB of base64 down the wire. 256 KiB is plenty for
		// the inspection use case (file signature, header, structure)
		// and keeps the JSON response under ~350 KiB. `truncated`
		// tells the client to surface a "showing first N bytes" hint.
		const hexPreviewCap = 256 * 1024
		preview := res.Content
		truncated := false
		if len(preview) > hexPreviewCap {
			preview = preview[:hexPreviewCap]
			truncated = true
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"path":           rp.Relative,
			"is_binary":      true,
			"is_symlink":     isSymlink,
			"size":           len(res.Content),
			"modified_at":    res.ModifiedAt,
			"content_base64": base64.StdEncoding.EncodeToString(preview),
			"truncated":      truncated,
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":        rp.Relative,
		"content":     string(res.Content),
		"checksum":    res.Checksum,
		"modified_at": res.ModifiedAt,
		"is_binary":   false,
		"is_symlink":  isSymlink,
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

// GET /api/fs/{mountId}/download?path=...&path=...
//
// Streams the selected entry (or a zip of multiple entries) back to the
// browser with a `Content-Disposition: attachment` header so the user
// gets a native save dialog. Three shapes:
//
//   - Exactly 1 file selected  -> raw file bytes, original mime if guessable.
//   - Exactly 1 directory      -> zip of the directory tree.
//   - Multiple paths           -> zip with each selection at the archive root.
//
// Each path is independently ACL-checked (ActionRead). Files that fail
// the check during a recursive walk are silently skipped so a single
// inaccessible entry doesn't sink the whole archive.
func (h *FSHandler) Download(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	mp, err := h.loadMount(r)
	if err != nil { h.writeError(w, err); return }
	rels := r.URL.Query()["path"]
	if len(rels) == 0 {
		http.Error(w, "missing path", http.StatusBadRequest); return
	}

	mc := mountpoints.MountContext(mp)
	resolved := make([]*filesystem.ResolvedPath, 0, len(rels))
	infos := make([]os.FileInfo, 0, len(rels))
	for _, rel := range rels {
		if err := h.rejectManifest(rel, user.IsAdmin); err != nil { h.writeError(w, err); return }
		rp, err := h.resolve(r, mp, rel)
		if err != nil { h.writeError(w, err); return }
		// Stat (not Lstat) so symlinks transparently behave like
		// their target: a symlink to a directory walks into a zip,
		// a symlink to a file streams as that file. The Resolve
		// step above already enforced the symlink policy (refusing
		// any link when MOUNTPAD_FOLLOW_SYMLINK is off, refusing
		// any link whose target escapes the mount root even when
		// it's on), so we don't duplicate that check here. This
		// matches the Read endpoint: if you can VIEW a symlink as
		// text, you can also DOWNLOAD it.
		info, err := os.Stat(rp.Absolute)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) { h.writeError(w, filesystem.ErrNotFound); return }
			h.writeError(w, err); return
		}
		if err := h.Resolver.Check(user, mc, rp.Absolute, info.IsDir(), acl.ActionRead); err != nil {
			h.writeError(w, err); return
		}
		resolved = append(resolved, rp)
		infos = append(infos, info)
	}

	// Dry-run mode: the frontend hits the same URL with `?check=1`
	// before triggering the real download navigation. That lets us
	// surface symlink/permission/not-found errors in a proper modal
	// instead of letting the browser navigate away to a plaintext
	// error page (which is what `<a download>` does when the server
	// answers with a non-2xx status).
	if r.URL.Query().Get("check") == "1" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Single-file fast path: stream the bytes directly without zipping
	// so the browser can pick a sensible filename and (eventually) play
	// media inline if the user clicks "open" instead of "save".
	if len(resolved) == 1 && !infos[0].IsDir() {
		streamFileAttachment(w, resolved[0].Absolute, filepath.Base(resolved[0].Absolute), infos[0])
		return
	}

	// Zip path: build a sensible archive name from the mount + first
	// selection. We don't reveal the host_path; the slug is what the
	// user sees in the UI already.
	zipName := mp.Slug + "-files.zip"
	if len(resolved) == 1 {
		zipName = filepath.Base(resolved[0].Absolute) + ".zip"
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", contentDisposition(zipName))

	zw := zip.NewWriter(w)
	defer zw.Close()

	for i, rp := range resolved {
		base := filepath.Base(rp.Absolute)
		if !infos[i].IsDir() {
			// Single file inside the zip: stored under its own name
			// at the archive root, keeping the structure flat.
			if err := writeZipFile(zw, rp.Absolute, base, infos[i]); err != nil {
				// We've already started writing the zip stream, so we
				// can't switch to an error JSON response. Best we can
				// do is bail and let the client see the truncated zip.
				return
			}
			continue
		}
		// Directory: walk it and store every regular file under
		// `<base>/<rel-to-base>`. Manifests and our app dotfolder
		// are filtered out the same way they are everywhere else.
		_ = filepath.WalkDir(rp.Absolute, func(p string, d os.DirEntry, walkErr error) error {
			if walkErr != nil { return nil }
			if p == rp.Absolute { return nil }
			seg := filepath.Base(p)
			if !h.Cfg.ShowManifests && (seg == h.Cfg.ManifestFilename || seg == ".mountpad") {
				if d.IsDir() { return filepath.SkipDir }
				return nil
			}
			info, err := d.Info()
			if err != nil { return nil }
			// Symlinks found mid-walk weren't independently vetted
			// by Resolve. Two-tier policy mirrors the entry-point:
			//   (a) when the effective MOUNTPAD_FOLLOW_SYMLINK is
			//       off, skip the symlink silently.
			//   (b) when it's on, follow the link but verify the
			//       evaluated target stays inside the mount root.
			//       Anything escaping is dropped without erroring
			//       the whole zip.
			// We never recurse INTO a symlinked directory either
			// way - WalkDir doesn't follow symlinks for traversal
			// - so a symlinked dir is at most stored as an empty
			// entry.
			if info.Mode()&os.ModeSymlink != 0 {
				if !h.followSymlinks(mp) { return nil }
				evaled, evalErr := filepath.EvalSymlinks(p)
				if evalErr != nil { return nil }
				if !filesystem.PathContains(rp.MountRoot, evaled) { return nil }
				// Replace the symlink's Lstat info with the
				// target's Stat info so the zip entry carries
				// the real size/modtime instead of the symlink's
				// (which is just a few bytes pointing at the
				// target path).
				if targetInfo, statErr := os.Stat(p); statErr == nil {
					info = targetInfo
				}
			}
			// Per-entry ACL check inside the walk: skip silently
			// (no error to the caller) so a sub-tree the user can
			// list but can't read partially doesn't blow up the
			// whole download.
			if err := h.Resolver.Check(user, mc, p, info.IsDir(), acl.ActionRead); err != nil {
				if info.IsDir() { return filepath.SkipDir }
				return nil
			}
			rel, _ := filepath.Rel(rp.Absolute, p)
			zipPath := filepath.ToSlash(filepath.Join(base, rel))
			if info.IsDir() {
				_, _ = zw.Create(zipPath + "/")
				return nil
			}
			return writeZipFile(zw, p, zipPath, info)
		})
	}
}

// streamFileAttachment ships a single file body with attachment headers.
// We rely on the OS-provided modtime for a weak ETag/Last-Modified and
// let http.ServeContent handle Range requests (so large files download
// resumably and the browser can show real progress).
func streamFileAttachment(w http.ResponseWriter, absPath, name string, info os.FileInfo) {
	f, err := os.Open(absPath)
	if err != nil { http.Error(w, "open failed", http.StatusInternalServerError); return }
	defer f.Close()
	w.Header().Set("Content-Disposition", contentDisposition(name))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeContent(w, &http.Request{Method: "GET"}, name, info.ModTime(), f)
}

// writeZipFile appends one regular file to the open zip writer at the
// given archive-relative path, preserving the mtime so timestamps
// survive the round-trip.
func writeZipFile(zw *zip.Writer, srcAbs, zipPath string, info os.FileInfo) error {
	hdr, err := zip.FileInfoHeader(info)
	if err != nil { return err }
	hdr.Name = zipPath
	hdr.Method = zip.Deflate
	dst, err := zw.CreateHeader(hdr)
	if err != nil { return err }
	src, err := os.Open(srcAbs)
	if err != nil { return err }
	defer src.Close()
	_, err = io.Copy(dst, src)
	return err
}

// contentDisposition builds a header value that survives unicode
// filenames. RFC 5987 `filename*=UTF-8''<pct-encoded>` is the format
// every modern browser respects; we also send a `filename=` ASCII
// fallback for the very long tail of older clients.
func contentDisposition(name string) string {
	asciiSafe := strings.Map(func(r rune) rune {
		if r < 0x20 || r > 0x7e || r == '"' || r == '\\' {
			return '_'
		}
		return r
	}, name)
	return `attachment; filename="` + asciiSafe + `"; filename*=UTF-8''` + url.PathEscape(name)
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
