package mountpoints

import (
	"context"
	"errors"
	"path/filepath"
	"strings"

	"github.com/mountpad/mountpad/internal/acl"
	"github.com/mountpad/mountpad/internal/db"
	"github.com/mountpad/mountpad/internal/models"
	"github.com/mountpad/mountpad/internal/repositories"
)

var (
	ErrSlugInvalid  = errors.New("slug must be lowercase letters, digits, dashes")
	ErrNameRequired = errors.New("name is required")
	ErrHostPath     = errors.New("host_path must be absolute")
	ErrModeInvalid  = errors.New("default_mode must be between 000 and 0777")
	ErrSlugExists   = errors.New("slug already exists")
	ErrPrincipal    = errors.New("default owner or group does not exist")
)

type Service struct {
	Repo *repositories.MountPointsRepo
}

func NewService(r *repositories.MountPointsRepo) *Service { return &Service{Repo: r} }

func validateSlug(s string) bool {
	if s == "" || len(s) > 64 {
		return false
	}
	for _, c := range s {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' {
			continue
		}
		return false
	}
	return !strings.HasPrefix(s, "-") && !strings.HasSuffix(s, "-")
}

func validateMount(m *models.MountPoint) error {
	if !validateSlug(m.Slug) {
		return ErrSlugInvalid
	}
	if strings.TrimSpace(m.Name) == "" {
		return ErrNameRequired
	}
	if !filepath.IsAbs(m.HostPath) {
		return ErrHostPath
	}
	if m.DefaultMode > 0o777 {
		return ErrModeInvalid
	}
	return nil
}

func classifyWriteError(err error) error {
	switch {
	case db.IsUniqueViolation(err):
		return ErrSlugExists
	case db.IsForeignKeyViolation(err):
		return ErrPrincipal
	default:
		return err
	}
}

func (s *Service) Create(ctx context.Context, m *models.MountPoint) error {
	if err := validateMount(m); err != nil {
		return err
	}
	return classifyWriteError(s.Repo.Create(ctx, m))
}

func (s *Service) Update(ctx context.Context, m *models.MountPoint) error {
	if err := validateMount(m); err != nil {
		return err
	}
	return classifyWriteError(s.Repo.Update(ctx, m))
}

type Changes struct {
	Slug, Name, Description, HostPath *string
	IsActive                          *bool
	DefaultOwnerSet                   bool
	DefaultOwnerID                    *int64
	DefaultGroupSet                   bool
	DefaultGroupID                    *int64
	DefaultMode                       *uint16
	AvatarColor                       *string
	FollowSymlinks                    *bool
}

func (s *Service) Patch(ctx context.Context, id int64, changes Changes) (*models.MountPoint, error) {
	m, err := s.Repo.UpdateAtomic(ctx, id, func(m *models.MountPoint) error {
		if changes.Slug != nil {
			m.Slug = *changes.Slug
		}
		if changes.Name != nil {
			m.Name = *changes.Name
		}
		if changes.Description != nil {
			m.Description = *changes.Description
		}
		if changes.HostPath != nil {
			m.HostPath = *changes.HostPath
		}
		if changes.IsActive != nil {
			m.IsActive = *changes.IsActive
		}
		if changes.DefaultOwnerSet {
			m.DefaultOwnerID = changes.DefaultOwnerID
		}
		if changes.DefaultGroupSet {
			m.DefaultGroupID = changes.DefaultGroupID
		}
		if changes.DefaultMode != nil {
			m.DefaultMode = *changes.DefaultMode
		}
		if changes.AvatarColor != nil {
			m.AvatarColor = *changes.AvatarColor
		}
		if changes.FollowSymlinks != nil {
			m.FollowSymlinks = *changes.FollowSymlinks
		}
		return validateMount(m)
	})
	return m, classifyWriteError(err)
}

// MountContext converts a model into the lightweight struct the ACL package
// expects, without leaking persistence concerns.
func MountContext(m *models.MountPoint) acl.MountContext {
	return acl.MountContext{
		HostPath:       m.HostPath,
		DefaultOwnerID: m.DefaultOwnerID,
		DefaultGroupID: m.DefaultGroupID,
		DefaultMode:    m.DefaultMode,
	}
}
