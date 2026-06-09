package acl

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/mountpad/mountpad/internal/manifests"
	"github.com/mountpad/mountpad/internal/models"
)

// MountContext bundles everything the resolver needs about a mount point.
// It is passed in by the service layer instead of being fetched here, to keep
// this package free of DB dependencies.
type MountContext struct {
	HostPath       string
	DefaultOwnerID *int64
	DefaultGroupID *int64
	DefaultMode    uint16
}

// Resolver resolves the effective {owner, group, mode} for any path inside
// a mount point, using the cascade:
//   1. explicit manifest entry in the parent directory
//   2. parent directory's own manifest entry (inheritance)
//   3. parent-of-parent, walking up to the mount root
//   4. mount point default policy
//
// The resolver is intentionally read-only. It never creates a manifest.
type Resolver struct {
	Store *manifests.Store
}

func NewResolver(store *manifests.Store) *Resolver {
	return &Resolver{Store: store}
}

// EffectiveACL is the materialised view of an entry's permissions.
type EffectiveACL struct {
	OwnerID *int64
	GroupID *int64
	Mode    uint16
	Source  string // "manifest", "inherited", "default"
}

// Resolve returns the EffectiveACL for a given absolute path inside a mount.
// pathAbs MUST be the canonical absolute path produced by filesystem.Resolve.
func (r *Resolver) Resolve(mc MountContext, pathAbs string) (*EffectiveACL, error) {
	rootCanon := filepath.Clean(mc.HostPath)
	target := filepath.Clean(pathAbs)

	if !strings.HasPrefix(target+string(filepath.Separator), rootCanon+string(filepath.Separator)) && target != rootCanon {
		return nil, fmt.Errorf("path %q outside mount %q", target, rootCanon)
	}

	if target == rootCanon {
		return &EffectiveACL{
			OwnerID: mc.DefaultOwnerID,
			GroupID: mc.DefaultGroupID,
			Mode:    mc.DefaultMode,
			Source:  "default",
		}, nil
	}

	parent := filepath.Dir(target)
	base := filepath.Base(target)

	if m, ok, err := r.Store.Load(parent); err == nil && ok {
		if e, present := m.Entries[base]; present {
			return &EffectiveACL{
				OwnerID: e.OwnerID,
				GroupID: e.GroupID,
				Mode:    e.Mode,
				Source:  "manifest",
			}, nil
		}
	}

	parentACL, err := r.Resolve(mc, parent)
	if err != nil {
		return nil, err
	}
	parentACL.Source = "inherited"
	return parentACL, nil
}

// Check decides whether a user is allowed to perform `action` against the
// given path. The caller is responsible for ensuring `pathAbs` was already
// safely resolved via filesystem.Resolve.
//
// `isDir` describes the target of the action.
//   - For ActionTraverse on intermediate segments, callers should walk
//     ancestors with isDir=true.
//   - For ActionCreate/ActionDelete the relevant target is the PARENT dir.
func (r *Resolver) Check(user *models.User, mc MountContext, pathAbs string, isDir bool, action Action) error {
	if user == nil {
		return ErrDenied
	}
	if user.IsAdmin {
		return nil
	}

	if err := r.checkTraverse(user, mc, filepath.Dir(pathAbs)); err != nil {
		return err
	}

	eff, err := r.resolveEffective(user, mc, pathAbs)
	if err != nil {
		return err
	}

	switch action {
	case ActionList:
		if !isDir {
			return fmt.Errorf("list on non-directory: %w", ErrDenied)
		}
		if HasRead(eff) && HasExec(eff) {
			return nil
		}
	case ActionTraverse:
		if HasExec(eff) {
			return nil
		}
	case ActionRead:
		if HasRead(eff) {
			return nil
		}
	case ActionWrite:
		if HasWrite(eff) {
			return nil
		}
	case ActionCreate, ActionDelete:
		// Caller passes the PARENT directory as pathAbs.
		if HasExec(eff) && HasWrite(eff) {
			return nil
		}
	case ActionChmod, ActionChown:
		acl, err := r.Resolve(mc, pathAbs)
		if err != nil {
			return err
		}
		if acl.OwnerID != nil && *acl.OwnerID == user.ID {
			return nil
		}
	}
	return ErrDenied
}

func (r *Resolver) resolveEffective(user *models.User, mc MountContext, pathAbs string) (uint16, error) {
	acl, err := r.Resolve(mc, pathAbs)
	if err != nil {
		return 0, err
	}
	return EffectiveBits(user, acl.OwnerID, acl.GroupID, acl.Mode), nil
}

// checkTraverse walks every segment between the mount root and `dirAbs` and
// requires X on each. The mount root itself is always traversable for
// authenticated users (entry into the mount is gated at the HTTP layer).
//
// `dirAbs` may legitimately point *outside* the mount when the caller invokes
// Check on the mount root itself: filepath.Dir(mountRoot) is one level above
// the root, which doesn't exist as far as the ACL system is concerned. We
// treat that case the same as targeting the root: no intermediate traversal
// is needed.
func (r *Resolver) checkTraverse(user *models.User, mc MountContext, dirAbs string) error {
	root := filepath.Clean(mc.HostPath)
	dirAbs = filepath.Clean(dirAbs)
	if dirAbs == root || dirAbs == "." {
		return nil
	}
	rel, err := filepath.Rel(root, dirAbs)
	if err != nil {
		return ErrDenied
	}
	if rel == "." {
		return nil
	}
	if strings.HasPrefix(rel, "..") {
		// Above the mount root: the caller was invoking Check directly on
		// the mount root, so there's no intermediate segment to traverse.
		return nil
	}

	cur := root
	for _, seg := range strings.Split(filepath.ToSlash(rel), "/") {
		cur = filepath.Join(cur, seg)
		eff, err := r.resolveEffective(user, mc, cur)
		if err != nil {
			return err
		}
		if !HasExec(eff) {
			return ErrDenied
		}
	}
	return nil
}
