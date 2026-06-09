package filesystem

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var (
	ErrInvalidPath      = errors.New("invalid path")
	ErrPathTraversal    = errors.New("path traversal denied")
	ErrSymlinkNotAllowed = errors.New("symlink not allowed")
	ErrOutsideMount     = errors.New("path outside mount point")
)

// ResolvedPath is the trusted result of resolving a user-provided relative path
// against a mount point. The Absolute field MUST be used for all subsequent
// filesystem operations.
type ResolvedPath struct {
	MountRoot    string // absolute, evaluated, canonical
	Relative     string // forward-slash, no leading slash, never starts with "/"
	Absolute     string // MountRoot joined with Relative (OS-native separators)
	IsMountRoot  bool
}

// Resolve takes a mount point host_path and a user-provided relative path,
// then returns a safely resolved absolute path that is guaranteed to live
// inside the mount root.
//
// Rules enforced:
//   - the mount root is evalSymlinks'd ONCE (canonical form)
//   - the relative path is cleaned of "." and ".."
//   - any ".." that escapes the root is rejected
//   - absolute paths in the relative input are rejected
//   - if allowSymlinks is false, ANY symlink along the resolved chain
//     (apart from the mount root itself) makes the call fail
//
// This MUST be the only entry point used to translate user paths into
// disk paths. Handlers must NEVER call filepath.Join with raw user input.
func Resolve(mountHostPath string, userRel string, allowSymlinks bool) (*ResolvedPath, error) {
	if mountHostPath == "" {
		return nil, fmt.Errorf("%w: empty mount root", ErrInvalidPath)
	}

	rootAbs, err := filepath.Abs(mountHostPath)
	if err != nil {
		return nil, fmt.Errorf("abs mount root: %w", err)
	}
	rootCanon, err := filepath.EvalSymlinks(rootAbs)
	if err != nil {
		return nil, fmt.Errorf("eval mount root: %w", err)
	}

	rel := userRel
	rel = strings.TrimSpace(rel)
	rel = strings.ReplaceAll(rel, "\\", "/")

	if filepath.IsAbs(rel) || strings.HasPrefix(rel, "/") {
		return nil, fmt.Errorf("%w: absolute paths not allowed", ErrInvalidPath)
	}

	if rel == "" || rel == "." || rel == "/" {
		return &ResolvedPath{
			MountRoot:   rootCanon,
			Relative:    "",
			Absolute:    rootCanon,
			IsMountRoot: true,
		}, nil
	}

	cleaned := filepath.ToSlash(filepath.Clean("/" + rel))
	if strings.HasPrefix(cleaned, "/..") || cleaned == "/.." {
		return nil, ErrPathTraversal
	}
	cleaned = strings.TrimPrefix(cleaned, "/")

	for _, seg := range strings.Split(cleaned, "/") {
		if seg == ".." || seg == "" {
			return nil, ErrPathTraversal
		}
	}

	absJoined := filepath.Join(rootCanon, filepath.FromSlash(cleaned))

	if !pathContains(rootCanon, absJoined) {
		return nil, ErrOutsideMount
	}

	if !allowSymlinks {
		if err := assertNoSymlinks(rootCanon, absJoined); err != nil {
			return nil, err
		}
	} else {
		if evaled, err := filepath.EvalSymlinks(absJoined); err == nil {
			if !pathContains(rootCanon, evaled) {
				return nil, ErrSymlinkNotAllowed
			}
		}
	}

	return &ResolvedPath{
		MountRoot: rootCanon,
		Relative:  cleaned,
		Absolute:  absJoined,
	}, nil
}

// assertNoSymlinks walks from the mount root down to target and lstat-checks
// each segment. If any intermediate component is a symlink, the call fails.
// Final component MAY be missing (e.g. for create operations).
func assertNoSymlinks(root, target string) error {
	rel, err := filepath.Rel(root, target)
	if err != nil {
		return err
	}
	if rel == "." {
		return nil
	}

	current := root
	segs := strings.Split(filepath.ToSlash(rel), "/")
	for i, seg := range segs {
		current = filepath.Join(current, seg)
		info, err := os.Lstat(current)
		if err != nil {
			if os.IsNotExist(err) && i == len(segs)-1 {
				return nil
			}
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return ErrSymlinkNotAllowed
		}
	}
	return nil
}

// pathContains reports whether child is equal to parent or lives strictly
// inside it. Both paths must already be cleaned and absolute.
func pathContains(parent, child string) bool {
	parent = filepath.Clean(parent)
	child = filepath.Clean(child)
	if parent == child {
		return true
	}
	rel, err := filepath.Rel(parent, child)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	if strings.HasPrefix(rel, "..") {
		return false
	}
	return true
}

// IsManifestName tells whether a base filename is a mountpad manifest file.
// Manifests are NEVER exposed to regular operations.
func IsManifestName(name, manifestFilename string) bool {
	return name == manifestFilename
}
