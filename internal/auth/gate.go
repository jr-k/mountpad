package auth

import (
	"context"
	"net/http"
	"strings"
	"sync/atomic"

	"github.com/mountpad/mountpad/internal/repositories"
)

// Gate fronts the SessionManager with the first-time-setup check and the
// safe-mode override. It is the only middleware the HTTP layer should
// mount.
//
// Authentication policy: once the first administrator exists, real
// authentication is enforced for every request. There is no "disable
// auth" toggle on purpose; the only escape hatch is SAFE_MODE, which
// is meant for recovery (password reset) and prints a loud warning.
type Gate struct {
	Sessions *SessionManager
	Users    *repositories.UsersRepo
	SafeMode bool

	// setupDone caches the "first admin exists" check so we don't query
	// the users table on every request once the wizard has been completed.
	// The users → 0 transition can't happen from the UI (the last admin
	// cannot delete themselves), so the cache is monotonic and safe to
	// flip once.
	setupDone atomic.Bool
}

func NewGate(s *SessionManager, u *repositories.UsersRepo, safeMode bool) *Gate {
	return &Gate{Sessions: s, Users: u, SafeMode: safeMode}
}

// IsAuthEnabled reports whether real authentication is currently enforced.
// It is true iff at least one user exists, i.e. iff the setup wizard has
// been completed. The result is cached via setupDone for the hot path.
func (g *Gate) IsAuthEnabled(ctx context.Context) bool {
	if g.setupDone.Load() {
		return true
	}
	if g.UserCount(ctx) > 0 {
		g.setupDone.Store(true)
		return true
	}
	return false
}

// UserCount returns the total number of users in the database. Used by the
// frontend wizard to decide whether to show the first-admin onboarding.
func (g *Gate) UserCount(ctx context.Context) int {
	list, err := g.Users.List(ctx)
	if err != nil {
		return 0
	}
	return len(list)
}

// Required is the standard middleware: under safe-mode, or before the
// first admin exists (in which case RequireSetup will already have
// short-circuited the request anyway), the synthetic admin is injected
// into the context. Otherwise a real session is required.
func (g *Gate) Required(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if g.SafeMode || !g.IsAuthEnabled(r.Context()) {
			ctx := WithUser(r.Context(), SyntheticAdmin(g.SafeMode), nil)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}
		u, s, err := g.Sessions.Resolve(r.Context(), r)
		if err != nil {
			if isAPIRequest(r) {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}
		next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), u, s)))
	})
}

// RequireSetup is the outermost gate: while no administrator exists and
// safe-mode is off, every request is funnelled into the /setup wizard. This
// is what guarantees the operator can't browse around the app (workspace,
// settings, public APIs) before the first admin has been created.
//
// Allowed escape hatches:
//   - SAFE_MODE=true bypasses the gate entirely so a stuck operator can
//     still reach the access page and reset passwords on an existing
//     install.
//   - The /setup page and its two backing endpoints (status + setup) are
//     always reachable, otherwise the wizard couldn't function.
//   - Static assets (/assets/*, /favicon.ico) and Vite's dev-server probes
//     are allowed so the SPA can actually load.
func (g *Gate) RequireSetup(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if g.SafeMode || g.setupDone.Load() {
			next.ServeHTTP(w, r)
			return
		}
		if g.UserCount(r.Context()) > 0 {
			g.setupDone.Store(true)
			next.ServeHTTP(w, r)
			return
		}
		if isSetupAllowed(r) {
			next.ServeHTTP(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.Error(w, "first-time setup required", http.StatusServiceUnavailable)
			return
		}
		http.Redirect(w, r, "/setup", http.StatusSeeOther)
	})
}

// SetupCompleted lets the Setup handler mark the gate as satisfied as soon
// as the first administrator has been created, avoiding a one-request race
// where the very next request would re-query the users table.
func (g *Gate) SetupCompleted() { g.setupDone.Store(true) }

func isSetupAllowed(r *http.Request) bool {
	switch r.URL.Path {
	case "/setup", "/api/auth/setup", "/api/auth/status":
		return true
	case "/favicon.ico":
		return true
	}
	return strings.HasPrefix(r.URL.Path, "/assets/")
}

// Optional is used for routes that may be accessed unauthenticated (e.g. the
// login page). It always injects a user when one is resolvable.
func (g *Gate) Optional(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if g.SafeMode || !g.IsAuthEnabled(r.Context()) {
			ctx := WithUser(r.Context(), SyntheticAdmin(g.SafeMode), nil)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}
		if u, s, err := g.Sessions.Resolve(r.Context(), r); err == nil {
			r = r.WithContext(WithUser(r.Context(), u, s))
		}
		next.ServeHTTP(w, r)
	})
}
