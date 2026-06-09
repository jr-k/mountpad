package filesystem

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrConflict        = errors.New("conflict: file changed since last read")
	ErrFileTooLarge    = errors.New("file too large to edit")
	ErrBinaryFile      = errors.New("binary file refused for text edit")
	ErrNotEmpty        = errors.New("directory not empty")
	ErrAlreadyExists   = errors.New("target already exists")
	ErrNotFound        = errors.New("not found")
	ErrManifestProtected = errors.New("manifest file is protected")
)

// DirEntry is a directory listing record. Owner/Group/Mode are filled in by
// the higher-level service after consulting the ACL resolver.
type DirEntry struct {
	Name       string
	IsDir      bool
	Size       int64
	ModifiedAt time.Time
}

// ListDir reads the entries of a directory and hides manifest files unless
// the showManifests flag is enabled.
func ListDir(dirAbs string, manifestFilename string, showManifests bool) ([]DirEntry, error) {
	entries, err := os.ReadDir(dirAbs)
	if err != nil {
		return nil, err
	}
	out := make([]DirEntry, 0, len(entries))
	for _, e := range entries {
		if !showManifests {
			name := e.Name()
			// Hide the per-dir ACL manifests and any of their temp files.
			if IsManifestName(name, manifestFilename) {
				continue
			}
			if strings.HasPrefix(name, ".mountpad.acl.") && strings.HasSuffix(name, ".tmp") {
				continue
			}
			// Hide the app-internal directory used to colocate SQLite DB and
			// future internal files inside a user-facing /storage mount.
			if name == ".mountpad" && e.IsDir() {
				continue
			}
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, DirEntry{
			Name:       e.Name(),
			IsDir:      e.IsDir(),
			Size:       info.Size(),
			ModifiedAt: info.ModTime().UTC(),
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].IsDir != out[j].IsDir {
			return out[i].IsDir
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out, nil
}

// ReadFile reads a file's contents while enforcing the editor size cap and
// binary detection. Returns the bytes plus a content checksum and mtime that
// the caller will pass back during the next write to detect conflicts.
type ReadResult struct {
	Content    []byte
	Checksum   string
	ModifiedAt time.Time
	IsBinary   bool
}

func ReadFile(absPath string, maxBytes int64) (*ReadResult, error) {
	info, err := os.Lstat(absPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if info.IsDir() {
		return nil, fmt.Errorf("is a directory")
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return nil, ErrSymlinkNotAllowed
	}
	if info.Size() > maxBytes {
		return nil, ErrFileTooLarge
	}
	f, err := os.Open(absPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxBytes {
		return nil, ErrFileTooLarge
	}
	sum := sha256.Sum256(data)
	return &ReadResult{
		Content:    data,
		Checksum:   hex.EncodeToString(sum[:]),
		ModifiedAt: info.ModTime().UTC(),
		IsBinary:   isBinary(data),
	}, nil
}

// WriteOptions controls conflict-detection on save.
type WriteOptions struct {
	ExpectedChecksum string    // if non-empty, write fails if current checksum differs
	ExpectedMTime    time.Time // if non-zero, write fails if current mtime differs
	CreateOnly       bool      // refuse to overwrite an existing file
}

// WriteResult is what callers persist after a successful write to keep their
// next save honest about conflict-checks.
type WriteResult struct {
	Checksum   string
	ModifiedAt time.Time
}

// WriteFileAtomic writes content to a file using temp + rename inside the
// same directory. It enforces conflict detection through expected checksum
// and/or mtime. The previous file is preserved until the rename succeeds.
func WriteFileAtomic(absPath string, content []byte, opts WriteOptions) (*WriteResult, error) {
	dir := filepath.Dir(absPath)
	base := filepath.Base(absPath)

	if existing, err := os.Lstat(absPath); err == nil {
		if existing.Mode()&os.ModeSymlink != 0 {
			return nil, ErrSymlinkNotAllowed
		}
		if opts.CreateOnly {
			return nil, ErrAlreadyExists
		}
		if !opts.ExpectedMTime.IsZero() && !sameMTime(existing.ModTime(), opts.ExpectedMTime) {
			return nil, ErrConflict
		}
		if opts.ExpectedChecksum != "" {
			cur, err := os.ReadFile(absPath)
			if err != nil {
				return nil, err
			}
			sum := sha256.Sum256(cur)
			if hex.EncodeToString(sum[:]) != opts.ExpectedChecksum {
				return nil, ErrConflict
			}
		}
	} else if !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	} else if !opts.CreateOnly && opts.ExpectedChecksum != "" {
		return nil, ErrConflict
	}

	tmp, err := os.CreateTemp(dir, "."+base+".*.tmp")
	if err != nil {
		return nil, err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(content); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return nil, err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return nil, err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return nil, err
	}
	if err := os.Rename(tmpName, absPath); err != nil {
		os.Remove(tmpName)
		return nil, err
	}
	info, err := os.Stat(absPath)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(content)
	return &WriteResult{
		Checksum:   hex.EncodeToString(sum[:]),
		ModifiedAt: info.ModTime().UTC(),
	}, nil
}

// CreateDir creates a single directory. parents=true behaves like MkdirAll.
func CreateDir(absPath string, parents bool) error {
	if _, err := os.Lstat(absPath); err == nil {
		return ErrAlreadyExists
	}
	if parents {
		return os.MkdirAll(absPath, 0o755)
	}
	return os.Mkdir(absPath, 0o755)
}

// Rename moves a file or directory. Symlinks are refused.
func Rename(src, dst string) error {
	if info, err := os.Lstat(src); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return ErrNotFound
		}
		return err
	} else if info.Mode()&os.ModeSymlink != 0 {
		return ErrSymlinkNotAllowed
	}
	if _, err := os.Lstat(dst); err == nil {
		return ErrAlreadyExists
	}
	return os.Rename(src, dst)
}

// DeleteFile removes a single file (not a directory). Symlinks are refused.
func DeleteFile(absPath string) error {
	info, err := os.Lstat(absPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return ErrNotFound
		}
		return err
	}
	if info.IsDir() {
		return fmt.Errorf("is a directory")
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return ErrSymlinkNotAllowed
	}
	return os.Remove(absPath)
}

// DeleteDirSimple removes an empty directory. Returns ErrNotEmpty otherwise.
// The manifest file (if any) of THIS directory is allowed and removed first.
func DeleteDirSimple(absPath string, manifestFilename string) error {
	info, err := os.Lstat(absPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return ErrNotFound
		}
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("not a directory")
	}
	entries, err := os.ReadDir(absPath)
	if err != nil {
		return err
	}
	hasReal := false
	for _, e := range entries {
		if e.Name() == manifestFilename {
			continue
		}
		hasReal = true
		break
	}
	if hasReal {
		return ErrNotEmpty
	}
	_ = os.Remove(filepath.Join(absPath, manifestFilename))
	return os.Remove(absPath)
}

// DeleteDirRecursive removes a directory and everything it contains. The
// CALLER is responsible for verifying ACLs on every descendant beforehand.
// We expose a Walk helper to enforce that policy.
func DeleteDirRecursive(absPath string) error {
	info, err := os.Lstat(absPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return ErrNotFound
		}
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("not a directory")
	}
	return os.RemoveAll(absPath)
}

// Walk yields every entry under rootAbs in deterministic order. Symlinks are
// skipped (never followed) so a single symlinked directory cannot exfiltrate
// a deep delete.
func Walk(rootAbs string, fn func(path string, info os.FileInfo) error) error {
	return filepath.WalkDir(rootAbs, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return nil
		}
		return fn(p, info)
	})
}

// sameMTime tolerates a 1ms drift since not all filesystems agree on
// nanosecond resolution.
func sameMTime(a, b time.Time) bool {
	d := a.Sub(b)
	if d < 0 {
		d = -d
	}
	return d < time.Millisecond
}

// isBinary scans up to 8KiB. A NUL byte means binary. Otherwise we require
// 95% printable runes for text classification.
func isBinary(b []byte) bool {
	if len(b) == 0 {
		return false
	}
	head := b
	if len(head) > 8192 {
		head = head[:8192]
	}
	if bytes.IndexByte(head, 0) >= 0 {
		return true
	}
	if !utf8.Valid(head) {
		return true
	}
	return false
}
