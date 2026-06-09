package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type DBDriver string

const (
	DriverSQLite   DBDriver = "sqlite"
	DriverPostgres DBDriver = "postgres"
)

type Config struct {
	Env             string
	AppName         string
	HTTPAddr        string
	PublicURL       string
	SessionSecret   string
	SessionLifetime time.Duration
	CookieSecure    bool

	DBDriver DBDriver
	DBDSN    string

	FrontendDistDir string
	FrontendDevURL  string
	UseViteDev      bool

	SafeMode bool

	MaxEditableFileSize int64

	ManifestFilename string
	ShowManifests    bool

	// FollowSymlinks toggles whether the filesystem layer dereferences
	// symbolic links inside a mount point. Default false: a symlink
	// inside a mount is treated as a hard error (list/read/download
	// all refuse it) so users can't exfiltrate files from outside
	// the configured root via a planted symlink. Set
	// MOUNTPAD_FOLLOW_SYMLINK=true to opt back in - useful for
	// curated mounts where the operator deliberately uses symlinks
	// to stitch trees together.
	FollowSymlinks bool
}

func Load() (*Config, error) {
	cfg := &Config{
		Env:                    getEnv("MOUNTPAD_ENV", "dev"),
		AppName:                getEnv("MOUNTPAD_APP_NAME", "MountPad"),
		HTTPAddr:               getEnv("MOUNTPAD_HTTP_ADDR", ":4499"),
		PublicURL:              getEnv("MOUNTPAD_PUBLIC_URL", "http://localhost:4499"),
		SessionSecret:          os.Getenv("MOUNTPAD_SESSION_SECRET"),
		SessionLifetime:        getDurationEnv("MOUNTPAD_SESSION_LIFETIME", 7*24*time.Hour),
		CookieSecure:           getBoolEnv("MOUNTPAD_COOKIE_SECURE", false),
		// DB_ENGINE is the public-facing knob; DB_DRIVER is kept as
		// a legacy alias so existing deployments don't break when they
		// upgrade. Default is sqlite - the zero-deps, single-binary
		// happy path.
		DBDriver:               DBDriver(firstNonEmpty(os.Getenv("DB_ENGINE"), os.Getenv("DB_DRIVER"), "sqlite")),
		DBDSN:                  os.Getenv("DB_DSN"),
		FrontendDistDir:        getEnv("MOUNTPAD_FRONTEND_DIST", "frontend/dist"),
		FrontendDevURL:         getEnv("MOUNTPAD_VITE_URL", "http://localhost:5173"),
		UseViteDev:             getBoolEnv("MOUNTPAD_VITE_DEV", false),
		SafeMode:               getBoolEnv("MOUNTPAD_SAFE_MODE", false),
		MaxEditableFileSize:    getInt64Env("MOUNTPAD_MAX_EDIT_BYTES", 4*1024*1024),
		ManifestFilename:       getEnv("MOUNTPAD_MANIFEST_FILENAME", ".mountpad.acl.json"),
		ShowManifests:          getBoolEnv("MOUNTPAD_SHOW_MANIFESTS", false),
		FollowSymlinks:         getBoolEnv("MOUNTPAD_FOLLOW_SYMLINK", false),
	}

	if cfg.SessionSecret == "" {
		if cfg.Env == "prod" {
			return nil, errors.New("MOUNTPAD_SESSION_SECRET is required in prod")
		}
		cfg.SessionSecret = "dev-insecure-session-secret-please-change-me"
	}

	// DB_DSN, when set, is the escape hatch: it overrides the
	// per-engine decomposed variables for anyone who needs an exotic
	// connection string we don't model with separate envs. Otherwise
	// we build the DSN from per-engine variables (DB_FILE for
	// sqlite; DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME /
	// DB_SSLMODE for postgres).
	switch cfg.DBDriver {
	case DriverSQLite:
		if cfg.DBDSN == "" {
			file := getEnv("DB_FILE", "./mountpad.db")
			cfg.DBDSN = sqliteDSN(file)
		}
	case DriverPostgres:
		if cfg.DBDSN == "" {
			dsn, err := postgresDSN()
			if err != nil {
				return nil, err
			}
			cfg.DBDSN = dsn
		}
	default:
		return nil, fmt.Errorf("unsupported DB_ENGINE %q (use sqlite or postgres)", cfg.DBDriver)
	}

	return cfg, nil
}

// sqliteDSN wraps a filesystem path in the URI form the modernc.org
// driver expects, with the two pragmas every MountPad deployment
// wants: foreign keys ON (we rely on FK cascades for cleanup) and
// WAL journaling (lower write contention on busy mounts).
func sqliteDSN(file string) string {
	return "file:" + file + "?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)"
}

// postgresDSN assembles a libpq-style URI from the decomposed
// DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME / DB_SSLMODE
// variables. DB_PASSWORD is the only one without a default: an empty
// password is allowed (some local trust setups) but if the caller
// wants the secure version they have to provide it explicitly. The
// password is URL-encoded so symbols like '@' or ':' don't break the
// URI parser downstream.
func postgresDSN() (string, error) {
	host := getEnv("DB_HOST", "localhost")
	port := getEnv("DB_PORT", "5432")
	user := getEnv("DB_USER", "mountpad")
	pass := os.Getenv("DB_PASSWORD")
	name := getEnv("DB_NAME", "mountpad")
	ssl := getEnv("DB_SSLMODE", "disable")
	if host == "" {
		return "", errors.New("DB_HOST is required for postgres engine")
	}
	u := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(user, pass),
		Host:     host + ":" + port,
		Path:     "/" + name,
		RawQuery: "sslmode=" + url.QueryEscape(ssl),
	}
	return u.String(), nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if s := strings.TrimSpace(v); s != "" {
			return s
		}
	}
	return ""
}

func getEnv(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func getBoolEnv(key string, def bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	switch v {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	}
	return def
}

func getInt64Env(key string, def int64) int64 {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return def
}

func getDurationEnv(key string, def time.Duration) time.Duration {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}
