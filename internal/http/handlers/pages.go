package handlers

import (
	"net/http"

	gonertia "github.com/romsar/gonertia"

	"github.com/mountpad/mountpad/internal/acl"
	"github.com/mountpad/mountpad/internal/auth"
	"github.com/mountpad/mountpad/internal/inertia"
	"github.com/mountpad/mountpad/internal/repositories"
)

type PagesHandler struct {
	Inertia  *gonertia.Inertia
	Mounts   *repositories.MountPointsRepo
	Gate     *auth.Gate
	Resolver *acl.Resolver
}

func NewPagesHandler(i *gonertia.Inertia, m *repositories.MountPointsRepo, g *auth.Gate, res *acl.Resolver) *PagesHandler {
	return &PagesHandler{Inertia: i, Mounts: m, Gate: g, Resolver: res}
}

func (h *PagesHandler) Workspace(w http.ResponseWriter, r *http.Request) {
	_ = h.Inertia.Render(w, r, "WorkspacePage", inertia.SharedProps(r, h.Gate, h.Mounts, h.Resolver))
}

// Setup renders the first-admin wizard. Once authentication has been
// enabled (or there is already at least one user) we bounce the operator
// away; there is no reason to revisit this page after the install.
func (h *PagesHandler) Setup(w http.ResponseWriter, r *http.Request) {
	if !h.Gate.SafeMode && (h.Gate.IsAuthEnabled(r.Context()) || h.Gate.UserCount(r.Context()) > 0) {
		http.Redirect(w, r, "/workspace", http.StatusSeeOther)
		return
	}
	_ = h.Inertia.Render(w, r, "SetupPage", inertia.SharedProps(r, h.Gate, nil, nil))
}

func (h *PagesHandler) AccessSettings(w http.ResponseWriter, r *http.Request) {
	_ = h.Inertia.Render(w, r, "AccessSettingsPage", inertia.SharedProps(r, h.Gate, h.Mounts, h.Resolver))
}

func (h *PagesHandler) MountPointsSettings(w http.ResponseWriter, r *http.Request) {
	_ = h.Inertia.Render(w, r, "MountPointsSettingsPage", inertia.SharedProps(r, h.Gate, h.Mounts, h.Resolver))
}

// Profile renders the per-user profile page. The actual data is fetched
// client-side from GET /api/me so the page works equally well for the
// signed-in user across refreshes (and avoids duplicating model fields in
// shared Inertia props).
func (h *PagesHandler) Profile(w http.ResponseWriter, r *http.Request) {
	_ = h.Inertia.Render(w, r, "ProfilePage", inertia.SharedProps(r, h.Gate, h.Mounts, h.Resolver))
}
