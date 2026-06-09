package config

import (
	"errors"
	"fmt"
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

	AllowSymlinks bool
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
		DBDriver:               DBDriver(getEnv("DB_DRIVER", "sqlite")),
		DBDSN:                  os.Getenv("DB_DSN"),
		FrontendDistDir:        getEnv("MOUNTPAD_FRONTEND_DIST", "frontend/dist"),
		FrontendDevURL:         getEnv("MOUNTPAD_VITE_URL", "http://localhost:5173"),
		UseViteDev:             getBoolEnv("MOUNTPAD_VITE_DEV", false),
		SafeMode:               getBoolEnv("MOUNTPAD_SAFE_MODE", false),
		MaxEditableFileSize:    getInt64Env("MOUNTPAD_MAX_EDIT_BYTES", 4*1024*1024),
		ManifestFilename:       getEnv("MOUNTPAD_MANIFEST_FILENAME", ".mountpad.acl.json"),
		ShowManifests:          getBoolEnv("MOUNTPAD_SHOW_MANIFESTS", false),
		AllowSymlinks:          getBoolEnv("MOUNTPAD_ALLOW_SYMLINKS", false),
	}

	if cfg.SessionSecret == "" {
		if cfg.Env == "prod" {
			return nil, errors.New("MOUNTPAD_SESSION_SECRET is required in prod")
		}
		cfg.SessionSecret = "dev-insecure-session-secret-please-change-me"
	}

	switch cfg.DBDriver {
	case DriverSQLite:
		if cfg.DBDSN == "" {
			cfg.DBDSN = "file:./mountpad.db?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)"
		}
	case DriverPostgres:
		if cfg.DBDSN == "" {
			return nil, errors.New("DB_DSN is required for postgres driver")
		}
	default:
		return nil, fmt.Errorf("unsupported DB_DRIVER %q (use sqlite or postgres)", cfg.DBDriver)
	}

	return cfg, nil
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
