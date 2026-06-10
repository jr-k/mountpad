package handlers

import (
	"archive/tar"
	"archive/zip"
	"compress/bzip2"
	"compress/gzip"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
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
	"github.com/mountpad/mountpad/internal/imaging"
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

// mediaKind classifies a filename into one of the inline-preview
// families the frontend knows how to render natively:
//
//   "image"  → <img src="...">
//   "video"  → <video controls src="...">
//   "audio"  → <audio controls src="...">
//   "pdf"    → <iframe src="..."> (every modern browser ships a viewer)
//
// Returns "" for anything else, in which case the editor falls back
// to the existing hex preview. Detection is extension-based - same
// philosophy as archiveKind: the user names a file .jpg because
// that's what it is, and magic-byte sniffing would just add latency
// to a cheap check the browser repeats anyway during decoding.
func mediaKind(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif":
		return "image"
	case ".mp4", ".webm", ".m4v", ".mov", ".ogv":
		return "video"
	case ".mp3", ".wav", ".ogg", ".oga", ".m4a", ".m4b", ".flac", ".aac",
		".opus", ".weba", ".wma", ".aif", ".aiff", ".mid", ".midi", ".amr":
		return "audio"
	case ".pdf":
		return "pdf"
	}
	return ""
}

// detectContentType returns a best-effort Content-Type for a file
// path, preferring the extension map (cheap, deterministic) and
// only falling back to application/octet-stream when nothing
// matches. We never sniff the body: the file is going straight to
// the browser, and modern browsers run their own sniffer regardless.
func detectContentType(absPath string) string {
	ext := strings.ToLower(filepath.Ext(absPath))
	if ext != "" {
		if t := mime.TypeByExtension(ext); t != "" {
			return t
		}
	}
	return "application/octet-stream"
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

	// Media short-circuit: when the extension says "this is an image
	// / video / audio / pdf we can render inline", we skip the full
	// ReadFile (which would buffer up to MaxEditableFileSize bytes
	// just to compute a hex preview the UI won't show anyway) and
	// let the client fetch the bytes through the dedicated /raw
	// endpoint with the right Content-Type. Stat alone gives us
	// size + modtime, which is all the metadata the media frame
	// needs.
	if mk := mediaKind(filepath.Base(rp.Absolute)); mk != "" {
		st, err := os.Stat(rp.Absolute)
		if err != nil { h.writeError(w, err); return }
		writeJSON(w, http.StatusOK, map[string]any{
			"path":        rp.Relative,
			"is_binary":   true,
			"is_symlink":  isSymlink,
			"media_kind":  mk,
			"size":        st.Size(),
			"modified_at": st.ModTime().UTC(),
		})
		return
	}

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

// GET /api/fs/{mountId}/raw?path=...
//
// Streams a single file inline (no `Content-Disposition: attachment`)
// with a best-effort Content-Type derived from the extension. Backs
// the in-app media preview: <img>, <video>, <audio>, <iframe>.
// http.ServeContent handles Range requests, so the user can scrub a
// video without downloading the whole file first.
//
// Symlink policy follows the rest of the read path: Resolve enforces
// the global + per-mount MOUNTPAD_FOLLOW_SYMLINK rules, so a symlink
// pointing outside the mount root is refused here exactly as it
// would be in Read or Download.
func (h *FSHandler) Raw(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	mp, err := h.loadMount(r)
	if err != nil { h.writeError(w, err); return }
	rel := r.URL.Query().Get("path")
	if err := h.rejectManifest(rel, user.IsAdmin); err != nil { h.writeError(w, err); return }
	rp, err := h.resolve(r, mp, rel)
	if err != nil { h.writeError(w, err); return }
	if err := h.Resolver.Check(user, mountpoints.MountContext(mp), rp.Absolute, false, acl.ActionRead); err != nil {
		h.writeError(w, err); return
	}

	info, err := os.Stat(rp.Absolute)
	if err != nil { h.writeError(w, err); return }
	if info.IsDir() {
		http.Error(w, "not a file", http.StatusBadRequest); return
	}

	f, err := os.Open(rp.Absolute)
	if err != nil { h.writeError(w, err); return }
	defer f.Close()

	// inline (vs attachment) tells the browser to render the bytes
	// rather than pop a save dialog. RFC 5987 utf-8 fallback so
	// non-ASCII filenames survive a "save as" from the right-click
	// menu.
	w.Header().Set("Content-Type", detectContentType(rp.Absolute))
	w.Header().Set("Content-Disposition",
		`inline; filename*=UTF-8''`+url.PathEscape(filepath.Base(rp.Absolute)))
	http.ServeContent(w, r, filepath.Base(rp.Absolute), info.ModTime(), f)
}

// isThumbnailable returns true for the raster formats the imaging
// package can decode. SVG is intentionally NOT included - vector
// files render natively at any size, so the frontend points its
// <img> at /raw directly instead of round-tripping through a
// thumbnail. Anything else (videos, audio, pdf, archives, …)
// stays on the emoji icon: backend video frame extraction would
// pull in ffmpeg, which is a much bigger commitment than this
// endpoint is worth right now.
func isThumbnailable(name string) bool {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp":
		return true
	}
	return false
}

// GET /api/fs/{mountId}/thumb?path=...&size=128
//
// Returns a JPEG thumbnail of the supplied image file, scaled so
// the longer edge fits within `size` (default 128, capped at 512).
// Backs the file-explorer grid + list previews, replacing the
// generic image emoji with the actual content.
//
// The endpoint is aggressively cacheable: the ETag combines file
// path + size + mtime, so any change on disk invalidates the
// browser cache on the next request. We honour If-None-Match for
// a cheap 304 path that skips the decode entirely, which matters
// once a folder of a few hundred photos has been visited once.
//
// Hard guard rails:
//   - 4 MiB cap on the source bytes we'll decode (anything larger
//     short-circuits to 415 → the frontend falls back to the emoji).
//     A 50 MB DSLR JPEG decoding to a 50 MP pixel buffer would
//     allocate ~200 MB just to make a 128×128 preview; the cap
//     keeps the endpoint from becoming a DoS lever.
//   - The standard ACL + symlink policy applies, identical to Read
//     / Download / Raw.
func (h *FSHandler) Thumb(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	mp, err := h.loadMount(r)
	if err != nil { h.writeError(w, err); return }
	rel := r.URL.Query().Get("path")
	if err := h.rejectManifest(rel, user.IsAdmin); err != nil { h.writeError(w, err); return }
	rp, err := h.resolve(r, mp, rel)
	if err != nil { h.writeError(w, err); return }
	if err := h.Resolver.Check(user, mountpoints.MountContext(mp), rp.Absolute, false, acl.ActionRead); err != nil {
		h.writeError(w, err); return
	}
	if !isThumbnailable(filepath.Base(rp.Absolute)) {
		http.Error(w, "unsupported", http.StatusUnsupportedMediaType); return
	}

	size := 128
	if v := r.URL.Query().Get("size"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			size = n
		}
	}

	info, err := os.Stat(rp.Absolute)
	if err != nil { h.writeError(w, err); return }
	if info.IsDir() {
		http.Error(w, "not a file", http.StatusBadRequest); return
	}
	// 4 MiB source cap. Tuneable; chosen so we cover the typical
	// "photo from a phone" range while keeping per-request decode
	// allocations bounded. Larger files surface as 415, which the
	// frontend treats as "fall back to the emoji icon".
	const maxSourceBytes = 4 * 1024 * 1024
	if info.Size() > maxSourceBytes {
		http.Error(w, "source too large", http.StatusUnsupportedMediaType); return
	}

	// ETag scopes by path + requested size + source mtime so the
	// browser cache is invalidated whenever any of those change.
	// SHA-1 is fine here: this is a cache key, not a security
	// primitive. Quoted per RFC 7232.
	h1 := sha1.Sum([]byte(fmt.Sprintf("%s|%d|%d", rp.Absolute, size, info.ModTime().UnixNano())))
	etag := `"` + hex.EncodeToString(h1[:]) + `"`
	w.Header().Set("ETag", etag)
	// 1h cache is short enough that a renamed/replaced file shows
	// the new preview reasonably quickly even without a hard
	// refresh, but long enough to cover an active browsing session
	// without re-decoding.
	w.Header().Set("Cache-Control", "private, max-age=3600")
	if match := r.Header.Get("If-None-Match"); match != "" && strings.Contains(match, etag) {
		w.WriteHeader(http.StatusNotModified); return
	}

	f, err := os.Open(rp.Absolute)
	if err != nil { h.writeError(w, err); return }
	defer f.Close()

	thumb, err := imaging.Thumbnail(f, size)
	if err != nil {
		if errors.Is(err, imaging.ErrUnsupported) {
			http.Error(w, "unsupported", http.StatusUnsupportedMediaType); return
		}
		http.Error(w, "thumbnail failed", http.StatusInternalServerError); return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Content-Length", strconv.Itoa(len(thumb)))
	_, _ = w.Write(thumb)
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

// POST /api/fs/{mountId}/upload?path=<dir>
//
// Streams every multipart part to a temp file inside the target
// directory, then renames it into place. Files are NEVER buffered
// fully in memory, so multi-gigabyte uploads run in O(1) memory and
// without hitting the default http.Request.ParseMultipartForm cap.
//
// Each upload is treated as "create new file": if a name already
// exists we report it as a partial failure rather than silently
// clobbering data. The response is always 200 with a per-file
// status array, so the frontend can surface "3 uploaded, 1
// conflict" without disambiguating an HTTP status code.
//
// ACL: ActionCreate on the target directory. Manifest filenames,
// .mountpad/, and the *.tmp manifest staging files are rejected
// up front so an upload can never bypass the rejectManifest gate
// that protects every other write path.
func (h *FSHandler) Upload(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	mp, err := h.loadMount(r)
	if err != nil { h.writeError(w, err); return }

	dirRel := r.URL.Query().Get("path")
	dirRP, err := h.resolve(r, mp, dirRel)
	if err != nil { h.writeError(w, err); return }

	// Verify the target is actually a directory; otherwise the
	// first temp-file rename would land at a sibling path, which is
	// almost certainly not what the operator intended.
	if info, err := os.Stat(dirRP.Absolute); err != nil {
		h.writeError(w, err); return
	} else if !info.IsDir() {
		http.Error(w, "target is not a directory", http.StatusBadRequest); return
	}

	mc := mountpoints.MountContext(mp)
	if err := h.Resolver.Check(user, mc, dirRP.Absolute, true, acl.ActionCreate); err != nil {
		h.writeError(w, err); return
	}

	reader, err := r.MultipartReader()
	if err != nil {
		http.Error(w, "expected multipart/form-data", http.StatusBadRequest); return
	}

	type fileResult struct {
		Name   string `json:"name"`
		Size   int64  `json:"size,omitempty"`
		Status string `json:"status"`           // "uploaded" | "conflict" | "error"
		Error  string `json:"error,omitempty"`
	}
	results := []fileResult{}

	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			http.Error(w, "multipart read error: "+err.Error(), http.StatusBadRequest)
			return
		}
		// Skip non-file form fields. Browsers only send the "files"
		// field name with our frontend, but defensive against future
		// callers that mix metadata fields into the same request.
		if part.FileName() == "" {
			_ = part.Close()
			continue
		}
		// filepath.Base strips any directory component the browser
		// might have included (Chrome will send a relative path for
		// folder uploads). We DON'T support directory structures
		// here: upload is flat into the target directory. A future
		// "preserve hierarchy" mode could opt-in to keeping the
		// part.FileName() relative path after a safety pass.
		name := filepath.Base(part.FileName())
		res := fileResult{Name: name}

		if name == "" || name == "." || name == ".." {
			res.Status = "error"
			res.Error = "invalid filename"
			results = append(results, res)
			_ = part.Close()
			continue
		}
		// Same protection as the rest of the write path: don't let
		// an upload masquerade as a manifest, a tmp manifest, or a
		// `.mountpad` shadow directory.
		if err := h.rejectManifest(name, user.IsAdmin); err != nil {
			res.Status = "error"
			res.Error = "filename is reserved"
			results = append(results, res)
			_ = part.Close()
			continue
		}

		destAbs := filepath.Join(dirRP.Absolute, name)
		if _, err := os.Lstat(destAbs); err == nil {
			res.Status = "conflict"
			res.Error = "already exists"
			results = append(results, res)
			_ = part.Close()
			continue
		}

		size, err := streamPartToFile(part, dirRP.Absolute, name)
		_ = part.Close()
		if err != nil {
			res.Status = "error"
			res.Error = err.Error()
			results = append(results, res)
			continue
		}
		res.Status = "uploaded"
		res.Size = size
		results = append(results, res)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"path":    dirRP.Relative,
		"files":   results,
	})
}

// streamPartToFile pipes a multipart.Part body to a temp file inside
// `dirAbs` then renames it into place at `name`. The temp file lives
// alongside the destination so the final rename is an atomic same-
// filesystem operation (no cross-device copy fallback). On any error
// the partial temp file is cleaned up.
func streamPartToFile(src io.Reader, dirAbs, name string) (int64, error) {
	// Same naming convention as WriteFileAtomic so a stray temp file
	// is visually recognisable as ours and matches the exclusion
	// rule applied by the explorer's hidden-file filter.
	tmp, err := os.CreateTemp(dirAbs, "."+name+".*.upload")
	if err != nil {
		return 0, err
	}
	tmpName := tmp.Name()
	n, err := io.Copy(tmp, src)
	if err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return 0, err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return 0, err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return 0, err
	}
	if err := os.Rename(tmpName, filepath.Join(dirAbs, name)); err != nil {
		os.Remove(tmpName)
		return 0, err
	}
	return n, nil
}

// extractPayload is the JSON body for POST /api/fs/{mountId}/extract.
type extractPayload struct {
	// Path of the archive to extract, relative to the mount root.
	Path string `json:"path"`
}

// POST /api/fs/{mountId}/extract
//
// Extracts a zip / tar / tar.gz / tar.bz2 archive into a sibling
// directory named after the archive (without its extension). The
// destination must not already exist - we never clobber existing
// content. Path entries are sanitised against zip-slip (no absolute
// paths, no parent traversal, every entry must stay inside the
// extraction root).
//
// ACL:
//   - ActionRead on the archive itself,
//   - ActionCreate on the parent directory (= where the destination
//     folder lands).
func (h *FSHandler) Extract(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFrom(r.Context())
	var p extractPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest); return
	}

	mp, err := h.loadMount(r)
	if err != nil { h.writeError(w, err); return }
	if err := h.rejectManifest(p.Path, user.IsAdmin); err != nil { h.writeError(w, err); return }

	rp, err := h.resolve(r, mp, p.Path)
	if err != nil { h.writeError(w, err); return }

	mc := mountpoints.MountContext(mp)
	if err := h.Resolver.Check(user, mc, rp.Absolute, false, acl.ActionRead); err != nil {
		h.writeError(w, err); return
	}
	parentAbs := filepath.Dir(rp.Absolute)
	if err := h.Resolver.Check(user, mc, parentAbs, true, acl.ActionCreate); err != nil {
		h.writeError(w, err); return
	}

	info, err := os.Stat(rp.Absolute)
	if err != nil { h.writeError(w, err); return }
	if info.IsDir() {
		http.Error(w, "not an archive", http.StatusBadRequest); return
	}

	destAbs := filepath.Join(parentAbs, archiveDestName(filepath.Base(rp.Absolute)))
	if _, err := os.Lstat(destAbs); err == nil {
		http.Error(w, "destination already exists", http.StatusConflict); return
	}

	kind := archiveKind(rp.Absolute)
	if kind == "" {
		http.Error(w, "unsupported archive format", http.StatusBadRequest); return
	}

	if err := os.Mkdir(destAbs, 0o755); err != nil {
		h.writeError(w, err); return
	}

	count, extractErr := extractArchive(rp.Absolute, destAbs, kind)
	if extractErr != nil {
		// Best-effort cleanup on failure so a half-extracted tree
		// doesn't linger; ignore the rm error - the original
		// extraction error is the one the caller needs.
		_ = os.RemoveAll(destAbs)
		http.Error(w, "extract failed: "+extractErr.Error(), http.StatusInternalServerError)
		return
	}

	destRel := relativeTo(mp.HostPath, destAbs)
	writeJSON(w, http.StatusOK, map[string]any{
		"archive":      rp.Relative,
		"destination":  destRel,
		"entry_count":  count,
	})
}

// archiveKind returns "zip" | "tar" | "tar.gz" | "tar.bz2", or ""
// when the extension isn't one we know how to handle. Detection is
// extension-based: we don't sniff the magic bytes because the user
// already told us their intent by naming the file accordingly, and
// magic detection adds complexity without buying meaningful safety
// (the unpacker rejects malformed streams anyway).
func archiveKind(absPath string) string {
	lower := strings.ToLower(absPath)
	switch {
	case strings.HasSuffix(lower, ".zip"):
		return "zip"
	case strings.HasSuffix(lower, ".tar"):
		return "tar"
	case strings.HasSuffix(lower, ".tar.gz"), strings.HasSuffix(lower, ".tgz"):
		return "tar.gz"
	case strings.HasSuffix(lower, ".tar.bz2"), strings.HasSuffix(lower, ".tbz"),
		strings.HasSuffix(lower, ".tbz2"):
		return "tar.bz2"
	}
	return ""
}

// archiveDestName strips every recognised archive extension off the
// base filename, returning the bare stem to use as the extraction
// destination folder. We strip both compound (.tar.gz) and simple
// (.zip) suffixes so "data.tar.gz" lands in "data/", not "data.tar/".
func archiveDestName(base string) string {
	stripped := base
	for _, ext := range []string{
		".tar.gz", ".tar.bz2", ".tbz2", ".tbz", ".tgz",
		".zip", ".tar",
	} {
		if strings.HasSuffix(strings.ToLower(stripped), ext) {
			return stripped[:len(stripped)-len(ext)]
		}
	}
	return stripped
}

// extractArchive dispatches by kind and unpacks into destRoot, which
// must already exist. Returns the number of entries written so the
// API can include it in the response (useful UX cue: "extracted 142
// files").
func extractArchive(archivePath, destRoot, kind string) (int, error) {
	switch kind {
	case "zip":
		return extractZip(archivePath, destRoot)
	case "tar":
		f, err := os.Open(archivePath)
		if err != nil { return 0, err }
		defer f.Close()
		return extractTar(f, destRoot)
	case "tar.gz":
		f, err := os.Open(archivePath)
		if err != nil { return 0, err }
		defer f.Close()
		gz, err := gzip.NewReader(f)
		if err != nil { return 0, err }
		defer gz.Close()
		return extractTar(gz, destRoot)
	case "tar.bz2":
		f, err := os.Open(archivePath)
		if err != nil { return 0, err }
		defer f.Close()
		return extractTar(bzip2.NewReader(f), destRoot)
	default:
		return 0, fmt.Errorf("unsupported kind %q", kind)
	}
}

// extractZip walks every entry of a zip archive and writes the file
// contents to destRoot. Directories listed in the archive are created
// explicitly; missing parent dirs for nested files are MkdirAll'd
// just-in-time (zip archives are not guaranteed to list every parent
// dir entry before its children).
func extractZip(archivePath, destRoot string) (int, error) {
	zr, err := zip.OpenReader(archivePath)
	if err != nil { return 0, err }
	defer zr.Close()

	count := 0
	for _, f := range zr.File {
		dest, err := safeJoin(destRoot, f.Name)
		if err != nil {
			continue
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(dest, 0o755); err != nil { return count, err }
			continue
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil { return count, err }
		rc, err := f.Open()
		if err != nil { return count, err }
		out, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
		if err != nil { rc.Close(); return count, err }
		if _, err := io.Copy(out, rc); err != nil {
			out.Close(); rc.Close(); return count, err
		}
		out.Close()
		rc.Close()
		count++
	}
	return count, nil
}

// extractTar walks a tar stream (already wrapped in any required
// decompressor) and writes entries to destRoot. Only regular files
// and directories are honoured; symlinks, char/block devices, fifos
// and the like are silently skipped - they're rare in user-facing
// archives and supporting them would have to negotiate with the
// mount-wide symlink policy.
func extractTar(r io.Reader, destRoot string) (int, error) {
	tr := tar.NewReader(r)
	count := 0
	for {
		hdr, err := tr.Next()
		if err == io.EOF { break }
		if err != nil { return count, err }
		dest, err := safeJoin(destRoot, hdr.Name)
		if err != nil { continue }
		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(dest, 0o755); err != nil { return count, err }
		case tar.TypeReg, tar.TypeRegA:
			if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil { return count, err }
			out, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
			if err != nil { return count, err }
			if _, err := io.Copy(out, tr); err != nil {
				out.Close(); return count, err
			}
			out.Close()
			count++
		default:
			// Skip symlinks, hardlinks, fifos, devices: not
			// safe to materialise without a clear policy
			// matching the rest of the mount's surface.
			continue
		}
	}
	return count, nil
}

// safeJoin joins an extraction root with an archive-relative path
// while enforcing zip-slip safety:
//
//   - the entry name must be a relative path (no leading slash,
//     no Windows drive letter),
//   - after Clean it must NOT escape the root via ".." traversals,
//   - the cleaned result must still live underneath the root.
//
// Returns an error for any entry that fails the check; callers
// should skip the entry instead of aborting the whole extraction
// so one malformed path doesn't poison the whole archive.
func safeJoin(root, name string) (string, error) {
	if name == "" {
		return "", fmt.Errorf("empty entry name")
	}
	// Normalise separators: tar/zip use forward slashes regardless
	// of the archiving platform.
	clean := filepath.Clean("/" + filepath.ToSlash(name))
	clean = strings.TrimPrefix(clean, "/")
	if clean == "" || clean == "." {
		return "", fmt.Errorf("invalid entry name")
	}
	if filepath.IsAbs(name) || strings.HasPrefix(name, "/") {
		return "", fmt.Errorf("absolute entry path")
	}
	joined := filepath.Join(root, clean)
	if !filesystem.PathContains(root, joined) {
		return "", fmt.Errorf("entry escapes extraction root")
	}
	return joined, nil
}
