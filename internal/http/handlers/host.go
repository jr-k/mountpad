package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// HostHandler exposes a read-only directory browser over the host
// filesystem visible to the running process. The only consumer is the
// "Folder picker" affordance on the new-mount form: admins can click
// their way to a directory instead of typing the absolute path. The
// endpoint is admin-only and never returns file contents - just the
// directory tree.
//
// In the Docker deployment, "the host filesystem" is the container
// rootfs: whatever the operator has bind-mounted in will show up
// under its mountpoint, and that's exactly the surface that a new
// MountPoint will be able to address. Anything not mounted into the
// container simply isn't visible, which matches the existing trust
// boundary of the application.
type HostHandler struct{}

func NewHostHandler() *HostHandler { return &HostHandler{} }

// HostEntry is one row in the Browse response. Files are returned too
// so the picker can show a complete listing (greyed out, non-clickable
// on the frontend) - that gives the operator the visual context of
// "yes, this folder also contains foo.txt" without making files
// pickable as mount roots.
type HostEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
}

type browseResponse struct {
	Path    string      `json:"path"`
	Parent  string      `json:"parent"`
	Entries []HostEntry `json:"entries"`
}

// Browse lists immediate children of the requested absolute path.
//
// Query params:
//
//	path          - absolute directory to list. Defaults to "/" when
//	                empty. Relative paths are rejected (we don't want
//	                "browsing" to depend on the server's cwd, which
//	                would surface random working-directory state).
//	show_hidden   - "1" to include dotfiles, otherwise they are
//	                filtered out (the default matches a typical file
//	                manager).
func (h *HostHandler) Browse(w http.ResponseWriter, r *http.Request) {
	requested := r.URL.Query().Get("path")
	if requested == "" {
		requested = "/"
	}
	if !filepath.IsAbs(requested) {
		http.Error(w, "path must be absolute", http.StatusBadRequest)
		return
	}
	// Clean canonicalises the path (collapses "..", duplicate
	// separators, trailing slashes). Important so the breadcrumb the
	// frontend computes from `path` stays stable as the user
	// navigates up/down.
	cleaned := filepath.Clean(requested)

	info, err := os.Stat(cleaned)
	if err != nil {
		http.Error(w, "cannot stat path: "+err.Error(), http.StatusNotFound)
		return
	}
	if !info.IsDir() {
		http.Error(w, "path is not a directory", http.StatusBadRequest)
		return
	}

	dirents, err := os.ReadDir(cleaned)
	if err != nil {
		// Permission denied is the common case here (browsing into
		// a directory the process can't read). Surface a 403 so the
		// frontend can display a friendlier "not allowed" empty
		// state rather than a generic 500.
		if os.IsPermission(err) {
			http.Error(w, "permission denied", http.StatusForbidden)
			return
		}
		http.Error(w, "cannot read directory: "+err.Error(), http.StatusInternalServerError)
		return
	}

	showHidden := r.URL.Query().Get("show_hidden") == "1"
	entries := make([]HostEntry, 0, len(dirents))
	for _, de := range dirents {
		name := de.Name()
		if !showHidden && strings.HasPrefix(name, ".") {
			continue
		}
		// Use Stat (not Lstat) so symlinked directories are still
		// reported as directories - the picker should be able to
		// follow them. The mount-time symlink policy is enforced
		// downstream on actual file operations, not at browse time.
		full := filepath.Join(cleaned, name)
		isDir := de.IsDir()
		if !isDir {
			if st, err := os.Stat(full); err == nil {
				isDir = st.IsDir()
			}
		}
		entries = append(entries, HostEntry{
			Name:  name,
			Path:  full,
			IsDir: isDir,
		})
	}

	// Directories first, then files; alphabetical within each group
	// (case-insensitive). Matches the file-manager convention and
	// lines up with the frontend's grouping.
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})

	parent := filepath.Dir(cleaned)
	if parent == cleaned {
		// At the root, filepath.Dir("/") returns "/". Emit "" so
		// the frontend can hide the "Up" button instead of looping
		// back on the same node.
		parent = ""
	}

	writeJSON(w, http.StatusOK, browseResponse{
		Path:    cleaned,
		Parent:  parent,
		Entries: entries,
	})
}
