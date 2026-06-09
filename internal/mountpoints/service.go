package mountpoints

import (
	"context"
	"errors"
	"path/filepath"
	"strings"

	"github.com/mountpad/mountpad/internal/acl"
	"github.com/mountpad/mountpad/internal/models"
	"github.com/mountpad/mountpad/internal/repositories"
)

var (
	ErrSlugInvalid = errors.New("slug must be lowercase letters, digits, dashes")
	ErrHostPath    = errors.New("host_path must be absolute")
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

func (s *Service) Create(ctx context.Context, m *models.MountPoint) error {
	if !validateSlug(m.Slug) {
		return ErrSlugInvalid
	}
	if !filepath.IsAbs(m.HostPath) {
		return ErrHostPath
	}
	if m.DefaultMode == 0 {
		m.DefaultMode = acl.UserR | acl.UserW | acl.UserX | acl.GroupR | acl.GroupX
	}
	return s.Repo.Create(ctx, m)
}

func (s *Service) Update(ctx context.Context, m *models.MountPoint) error {
	if !validateSlug(m.Slug) {
		return ErrSlugInvalid
	}
	if !filepath.IsAbs(m.HostPath) {
		return ErrHostPath
	}
	return s.Repo.Update(ctx, m)
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
