package inertia

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	gonertia "github.com/romsar/gonertia"

	"github.com/mountpad/mountpad/internal/acl"
	"github.com/mountpad/mountpad/internal/auth"
	"github.com/mountpad/mountpad/internal/config"
	"github.com/mountpad/mountpad/internal/models"
	"github.com/mountpad/mountpad/internal/mountpoints"
	"github.com/mountpad/mountpad/internal/repositories"
	"github.com/mountpad/mountpad/internal/version"
)

// New wires gonertia against either a built dist (prod) or the Vite dev server
// (dev). Shared props are computed on every request.
func New(cfg *config.Config, sessions *auth.SessionManager, mounts *repositories.MountPointsRepo) (*gonertia.Inertia, error) {
	rootHTML := filepath.Join(cfg.FrontendDistDir, "index.html")
	if _, err := os.Stat(rootHTML); err != nil {
		// In dev we still need a template; Vite serves the real one, but
		// gonertia requires a root layout. Fall back to a minimal stub.
		rootHTML = filepath.Join(cfg.FrontendDistDir, ".gonertia.html")
		if err := os.MkdirAll(cfg.FrontendDistDir, 0o755); err == nil {
			_ = os.WriteFile(rootHTML, []byte(fallbackTemplate(cfg)), 0o644)
		}
	}

	opts := []gonertia.Option{}
	// Versioning is only enabled when the Vite manifest already exists
	// (i.e. a production build is present). In dev, Vite serves modules at
	// runtime and no manifest is emitted, so we skip versioning.
	manifestPath := filepath.Join(cfg.FrontendDistDir, ".vite", "manifest.json")
	if _, err := os.Stat(manifestPath); err == nil {
		opts = append(opts, gonertia.WithVersionFromFile(manifestPath))
	}

	i, err := gonertia.NewFromFile(rootHTML, opts...)
	if err != nil {
		return nil, fmt.Errorf("init inertia: %w", err)
	}

	i.ShareTemplateData("frontendDevURL", cfg.FrontendDevURL)
	i.ShareTemplateData("useViteDev", cfg.UseViteDev)
	i.ShareTemplateData("appName", cfg.AppName)

	// `app` is a static shared prop (neither the app name nor the
	// build version change at runtime), so we don't recompute it
	// inside SharedProps on every request. The name is configurable
	// via MOUNTPAD_APP_NAME for white-labelling; the version comes
	// from the `internal/version` package and is overridden at build
	// time via -ldflags.
	i.ShareProp("app", map[string]any{
		"name":    cfg.AppName,
		"version": version.Version,
	})
	i.ShareProp("flash", map[string]any{})
	return i, nil
}

// SharedProps must be called per-request to expose the authenticated user and
// the list of mounts to every Inertia page.
//
// `mounts` is optional: pages that don't need the mount-point list (typically
// the login screen) can pass nil and the `mount_points` key is simply omitted
// from the shared payload. The `auth` block is always emitted so every page
// can rely on `props.auth.enabled` / `props.auth.user`.
//
// `resolver` is also optional: when provided, the returned mount list is
// filtered down to entries the current user actually has list permission on
// (admins always see everything). This is what keeps inaccessible mounts off
// the workspace sidebar without leaking their existence.
func SharedProps(r *http.Request, gate *auth.Gate, mounts *repositories.MountPointsRepo, resolver *acl.Resolver) gonertia.Props {
	props := gonertia.Props{}
	authBlock := map[string]any{
		"user":       nil,
		"enabled":    gate.IsAuthEnabled(r.Context()),
		"safe_mode":  gate.SafeMode,
		"user_count": gate.UserCount(r.Context()),
	}
	user := auth.UserFrom(r.Context())
	if user != nil {
		authBlock["user"] = map[string]any{
			"id":           user.ID,
			"username":     user.Username,
			"display_name": user.DisplayName,
			"first_name":   user.FirstName,
			"last_name":    user.LastName,
			"email":        user.Email,
			"avatar_color": user.AvatarColor,
			"is_admin":     user.IsAdmin,
			"group_ids":    user.GroupIDs,
			"synthetic":    auth.IsSynthetic(user),
		}
	}
	props["auth"] = authBlock
	if mounts != nil {
		if list, err := mounts.ListActive(r.Context()); err == nil {
			props["mount_points"] = visibleMounts(list, user, resolver)
		}
	}
	return props
}

// visibleMounts returns the subset of `list` the given user is allowed to
// list. Admins (and the synthetic user injected under SAFE_MODE) see every
// active mount. Regular users only see mounts whose root passes an
// ActionList check, so the sidebar matches what the backend will actually
// serve. With no resolver wired in, we keep the legacy behaviour and return
// everything (used by login/setup pages where mount_points isn't read).
func visibleMounts(list []*models.MountPoint, user *models.User, resolver *acl.Resolver) []*models.MountPoint {
	if user == nil || user.IsAdmin || resolver == nil {
		return list
	}
	out := make([]*models.MountPoint, 0, len(list))
	for _, mp := range list {
		mc := mountpoints.MountContext(mp)
		if err := resolver.Check(user, mc, mp.HostPath, true, acl.ActionList); err == nil {
			out = append(out, mp)
		}
	}
	return out
}

func fallbackTemplate(cfg *config.Config) string {
	_ = cfg
	// Mirrors the static `frontend/index.html` used in production so dev
	// reloads have identical <head> chrome (favicons, theme color, app
	// name). Keeping the two in sync is a manual exercise but the head is
	// small enough to make that worthwhile.
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{{ .appName }}</title>
<link rel="apple-touch-icon-precomposed" sizes="57x57"   href="/favicons/apple-touch-icon-57x57.png" />
<link rel="apple-touch-icon-precomposed" sizes="60x60"   href="/favicons/apple-touch-icon-60x60.png" />
<link rel="apple-touch-icon-precomposed" sizes="72x72"   href="/favicons/apple-touch-icon-72x72.png" />
<link rel="apple-touch-icon-precomposed" sizes="76x76"   href="/favicons/apple-touch-icon-76x76.png" />
<link rel="apple-touch-icon-precomposed" sizes="114x114" href="/favicons/apple-touch-icon-114x114.png" />
<link rel="apple-touch-icon-precomposed" sizes="120x120" href="/favicons/apple-touch-icon-120x120.png" />
<link rel="apple-touch-icon-precomposed" sizes="144x144" href="/favicons/apple-touch-icon-144x144.png" />
<link rel="apple-touch-icon-precomposed" sizes="152x152" href="/favicons/apple-touch-icon-152x152.png" />
<link rel="icon" type="image/png" sizes="196x196" href="/favicons/favicon-196x196.png" />
<link rel="icon" type="image/png" sizes="128x128" href="/favicons/favicon-128.png" />
<link rel="icon" type="image/png" sizes="96x96"   href="/favicons/favicon-96x96.png" />
<link rel="icon" type="image/png" sizes="32x32"   href="/favicons/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16"   href="/favicons/favicon-16x16.png" />
<link rel="shortcut icon" href="/favicon.ico" />
<meta name="application-name" content="{{ .appName }}" />
<meta name="msapplication-TileColor" content="#FFFFFF" />
<meta name="msapplication-TileImage" content="/favicons/mstile-144x144.png" />
<meta name="msapplication-square70x70logo" content="/favicons/mstile-70x70.png" />
<meta name="msapplication-square150x150logo" content="/favicons/mstile-150x150.png" />
<meta name="msapplication-wide310x150logo" content="/favicons/mstile-310x150.png" />
<meta name="msapplication-square310x310logo" content="/favicons/mstile-310x310.png" />
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f6f8fa" />
<meta name="theme-color" media="(prefers-color-scheme: dark)"  content="#0d1117" />
{{ if .useViteDev }}
<script type="module">
import RefreshRuntime from "{{ .frontendDevURL }}/@react-refresh"
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
</script>
<script type="module" src="{{ .frontendDevURL }}/@vite/client"></script>
<script type="module" src="{{ .frontendDevURL }}/src/main.tsx"></script>
{{ else }}
<link rel="stylesheet" href="/assets/index.css" />
<script type="module" src="/assets/index.js"></script>
{{ end }}
</head>
<body>{{ .inertia }}</body>
</html>`
}
