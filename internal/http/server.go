package http

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	gonertia "github.com/romsar/gonertia"

	"github.com/mountpad/mountpad/internal/acl"
	"github.com/mountpad/mountpad/internal/auth"
	"github.com/mountpad/mountpad/internal/config"
	"github.com/mountpad/mountpad/internal/http/handlers"
	"github.com/mountpad/mountpad/internal/manifests"
	"github.com/mountpad/mountpad/internal/mountpoints"
	"github.com/mountpad/mountpad/internal/repositories"
)

type Deps struct {
	Cfg       *config.Config
	Inertia   *gonertia.Inertia
	Sessions  *auth.SessionManager
	Gate      *auth.Gate
	Users     *repositories.UsersRepo
	Groups    *repositories.GroupsRepo
	Mounts    *repositories.MountPointsRepo
	MountsSvc *mountpoints.Service
	Manifest  *manifests.Store
	Resolver  *acl.Resolver
}

func NewRouter(d *Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.NoCache)
	r.Use(d.Inertia.Middleware)
	// RequireSetup runs ahead of every route: when no administrator exists
	// (and SAFE_MODE is off), browsers are 302'd to /setup and APIs get a
	// 503. Once the wizard has been completed the middleware no-ops.
	r.Use(d.Gate.RequireSetup)

	authH := handlers.NewAuthHandler(d.Sessions, d.Gate, d.Users, d.Inertia)
	pages := handlers.NewPagesHandler(d.Inertia, d.Mounts, d.Gate, d.Resolver)
	fsH := handlers.NewFSHandler(d.Cfg, d.Mounts, d.Manifest, d.Resolver)
	aclH := handlers.NewACLHandler(d.Cfg, d.Mounts, d.Manifest, d.Resolver, fsH)
	usersH := handlers.NewUsersHandler(d.Users)
	groupsH := handlers.NewGroupsHandler(d.Groups)
	mountsH := handlers.NewMountPointsHandler(d.MountsSvc)

	r.Group(func(r chi.Router) {
		r.Use(d.Gate.Optional)
		r.Get("/login", authH.ShowLogin)
		r.Post("/login", authH.Login)
		r.Get("/setup", pages.Setup)
		r.Get("/api/auth/status", authH.Status)
		r.Post("/api/auth/setup", authH.Setup)
	})

	r.Post("/logout", authH.Logout)

	r.Group(func(r chi.Router) {
		r.Use(d.Gate.Required)

		r.Get("/", pages.Workspace)
		r.Get("/workspace", pages.Workspace)
		// Wildcard so deep-linked URLs like /workspace/{slug}/{file/path}
		// resolve to the same SPA shell. The frontend parses the path to
		// restore the active mount point and open the requested file.
		r.Get("/workspace/*", pages.Workspace)
		r.Get("/settings/access", pages.AccessSettings)
		r.Get("/settings/mount-points", pages.MountPointsSettings)
		// Profile page: every authenticated user can edit their own
		// display name, email, avatar, and password from here.
		r.Get("/profile", pages.Profile)
		// Legacy URLs: redirect to the consolidated Access page.
		r.Get("/settings/users", redirect("/settings/access"))
		r.Get("/settings/groups", redirect("/settings/access"))

		r.Route("/api", func(r chi.Router) {
			r.Get("/me", authH.Me)
			// PATCH /me: signed-in user updates their own profile (name,
			// email, avatar color, password). The handler strips admin-only
			// fields before persisting, so it's safe to expose to members.
			r.Patch("/me", usersH.UpdateMe)

			// Directory endpoints: lightweight {id, name} listings, safe to
			// expose to non-admins so the file tree can resolve owner/group
			// IDs into human-readable labels for the details panel.
			r.Get("/directory/users", usersH.Directory)
			r.Get("/directory/groups", groupsH.Directory)

			r.Route("/fs/{mountId}", func(r chi.Router) {
				r.Get("/list", fsH.List)
				r.Get("/read", fsH.Read)
				r.Get("/download", fsH.Download)
				r.Put("/write", fsH.Write)
				r.Post("/file", fsH.CreateFile)
				r.Post("/directory", fsH.CreateDir)
				r.Patch("/rename", fsH.Rename)
				r.Delete("/delete", fsH.Delete)
				r.Delete("/deep-delete", fsH.DeepDelete)

				r.Get("/acl", aclH.Get)
				r.Put("/acl", aclH.Set)
				r.Patch("/owner", aclH.Chown)
				r.Patch("/group", aclH.Chgrp)
			})

			r.Group(func(r chi.Router) {
				r.Use(auth.AdminOnly)
				r.Get("/users", usersH.List)
				r.Post("/users", usersH.Create)
				r.Patch("/users/{id}", usersH.Update)
				r.Delete("/users/{id}", usersH.Delete)
				r.Post("/users/{id}/groups", usersH.AddToGroup)
				r.Delete("/users/{id}/groups/{groupId}", usersH.RemoveFromGroup)

				r.Get("/groups", groupsH.List)
				r.Post("/groups", groupsH.Create)
				r.Patch("/groups/{id}", groupsH.Update)
				r.Delete("/groups/{id}", groupsH.Delete)

				r.Get("/mount-points", mountsH.List)
				r.Post("/mount-points", mountsH.Create)
				r.Patch("/mount-points/{id}", mountsH.Update)
				r.Delete("/mount-points/{id}", mountsH.Delete)
			})
		})
	})

	// Static assets:
	//   /assets/*       Vite build output (prod only, never in dev where
	//                   modules are streamed straight from `vite serve`).
	//   /favicon.ico    Legacy single-file favicon, kept at the root so
	//                   browsers that probe the conventional path are
	//                   satisfied without parsing the head.
	//   /favicons/*     Full favicon set (apple touch, mstile, sized PNGs).
	//
	// Favicons live in `frontend/public/` so Vite copies them verbatim
	// into `dist/` at build time. In dev we serve them straight from the
	// source folder so they're reachable from the Go host even when Vite
	// is the one serving the JS bundle.
	distDir := d.Cfg.FrontendDistDir
	publicDir := filepath.Join("frontend", "public")

	if distDir != "" {
		if info, err := os.Stat(filepath.Join(distDir, "assets")); err == nil && info.IsDir() {
			r.Handle("/assets/*", http.FileServer(http.Dir(distDir)))
		}
	}
	r.Handle("/favicon.ico", staticFallback("/favicon.ico", distDir, publicDir))
	r.Handle("/favicons/*", staticFallback("", distDir, publicDir))

	return r
}

// staticFallback returns a handler that tries each candidate root in turn
// (dist first, then `frontend/public/`) and serves the first match. If
// `singlePath` is non-empty, it's used verbatim as the file name within
// each root (useful for the bare `/favicon.ico` route); otherwise the
// request path is honoured. Roots that don't exist on disk are skipped
// silently so the dev/prod difference doesn't require config branching.
func staticFallback(singlePath string, roots ...string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rel := r.URL.Path
		if singlePath != "" {
			rel = singlePath
		}
		for _, root := range roots {
			if root == "" {
				continue
			}
			full := filepath.Join(root, filepath.FromSlash(rel))
			if info, err := os.Stat(full); err == nil && !info.IsDir() {
				http.ServeFile(w, r, full)
				return
			}
		}
		http.NotFound(w, r)
	}
}

// redirect returns a handler that 302-redirects to the given target. Used to
// keep legacy URLs alive after consolidating pages.
func redirect(to string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, to, http.StatusFound)
	}
}
