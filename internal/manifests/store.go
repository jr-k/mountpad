package manifests

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Store is a per-directory manifest reader/writer.
//
// Concurrency model:
//   - One in-process RWMutex per absolute directory path (keyed lazily).
//   - Writes are atomic: write to a sibling temp file then os.Rename().
//   - Manifests are NEVER created on read. A missing manifest is a perfectly
//     valid state; the caller is expected to fall back to inherited defaults.
//
// Filesystem-as-source-of-truth guarantee:
//   - On every Load(), entries whose file no longer exists on disk are
//     silently dropped (lazy GC). This keeps the manifest in sync without
//     requiring background scans.
type Store struct {
	manifestFilename string
	mu               sync.Mutex
	locks            map[string]*sync.Mutex
}

func NewStore(manifestFilename string) *Store {
	return &Store{
		manifestFilename: manifestFilename,
		locks:            map[string]*sync.Mutex{},
	}
}

func (s *Store) Filename() string { return s.manifestFilename }

func (s *Store) lockFor(dirAbs string) *sync.Mutex {
	s.mu.Lock()
	defer s.mu.Unlock()
	if l, ok := s.locks[dirAbs]; ok {
		return l
	}
	l := &sync.Mutex{}
	s.locks[dirAbs] = l
	return l
}

// pathFor returns the absolute path of the manifest file for a directory.
func (s *Store) pathFor(dirAbs string) string {
	return filepath.Join(dirAbs, s.manifestFilename)
}

// Load reads the manifest for the given directory. Returns (manifest, true)
// if found, or (empty manifest, false) when no manifest exists. Any GC of
// stale entries is performed silently before return.
//
// dirAbs MUST be an already-resolved, safe absolute path.
func (s *Store) Load(dirAbs string) (*Manifest, bool, error) {
	mfPath := s.pathFor(dirAbs)
	raw, err := os.ReadFile(mfPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return New(), false, nil
		}
		return nil, false, fmt.Errorf("read manifest %q: %w", mfPath, err)
	}

	m := New()
	if err := json.Unmarshal(raw, m); err != nil {
		return New(), false, fmt.Errorf("parse manifest %q: %w", mfPath, err)
	}
	if m.Entries == nil {
		m.Entries = map[string]Entry{}
	}

	for name := range m.Entries {
		if _, err := os.Lstat(filepath.Join(dirAbs, name)); errors.Is(err, fs.ErrNotExist) {
			delete(m.Entries, name)
		}
	}

	return m, true, nil
}

// Save writes the manifest atomically. If the manifest has no entries, the
// file is removed instead of being persisted.
//
// dirAbs MUST be an already-resolved, safe absolute path.
func (s *Store) Save(dirAbs string, m *Manifest) error {
	if m == nil {
		return errors.New("nil manifest")
	}
	mu := s.lockFor(dirAbs)
	mu.Lock()
	defer mu.Unlock()

	mfPath := s.pathFor(dirAbs)

	if len(m.Entries) == 0 {
		if err := os.Remove(mfPath); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
		return nil
	}

	if m.Version == 0 {
		m.Version = 1
	}
	for k, e := range m.Entries {
		if e.Modified.IsZero() {
			e.Modified = time.Now().UTC()
			m.Entries[k] = e
		}
	}

	raw, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}

	tmp, err := os.CreateTemp(dirAbs, ".mountpad.acl.*.tmp")
	if err != nil {
		return fmt.Errorf("create temp manifest: %w", err)
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(raw); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, mfPath); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("rename manifest: %w", err)
	}
	return nil
}

// UpsertEntry sets or replaces a single entry inside the directory's manifest.
// This is what the ACL layer calls when an explicit chmod / chown / chgrp
// happens. It is the ONLY moment a manifest is created on disk.
func (s *Store) UpsertEntry(dirAbs, name string, entry Entry) error {
	mu := s.lockFor(dirAbs)
	mu.Lock()
	defer mu.Unlock()

	m, _, err := s.loadLocked(dirAbs)
	if err != nil {
		return err
	}
	entry.Modified = time.Now().UTC()
	m.Entries[name] = entry
	return s.saveLocked(dirAbs, m)
}

// DeleteEntry removes a single entry from a manifest. Safe to call when the
// manifest does not exist.
func (s *Store) DeleteEntry(dirAbs, name string) error {
	mu := s.lockFor(dirAbs)
	mu.Lock()
	defer mu.Unlock()

	m, found, err := s.loadLocked(dirAbs)
	if err != nil {
		return err
	}
	if !found {
		return nil
	}
	delete(m.Entries, name)
	return s.saveLocked(dirAbs, m)
}

func (s *Store) loadLocked(dirAbs string) (*Manifest, bool, error) {
	raw, err := os.ReadFile(s.pathFor(dirAbs))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return New(), false, nil
		}
		return nil, false, err
	}
	m := New()
	if err := json.Unmarshal(raw, m); err != nil {
		return New(), false, err
	}
	if m.Entries == nil {
		m.Entries = map[string]Entry{}
	}
	return m, true, nil
}

func (s *Store) saveLocked(dirAbs string, m *Manifest) error {
	mfPath := s.pathFor(dirAbs)

	if len(m.Entries) == 0 {
		if err := os.Remove(mfPath); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
		return nil
	}

	if m.Version == 0 {
		m.Version = 1
	}
	raw, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dirAbs, ".mountpad.acl.*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(raw); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, mfPath); err != nil {
		os.Remove(tmpName)
		return err
	}
	return nil
}
