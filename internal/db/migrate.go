package db

import (
	"fmt"
	"path/filepath"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/database/sqlite"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	"github.com/mountpad/mountpad/internal/config"
)

// Migrate runs forward migrations for the given driver against the database.
// migrationsRoot is the project-relative folder containing `postgres/` and `sqlite/`.
func Migrate(cfg *config.Config, migrationsRoot string) error {
	var sub string
	var dbURL string

	switch cfg.DBDriver {
	case config.DriverSQLite:
		sub = "sqlite"
		// The migrate library opens a *separate* SQLite connection BEFORE the
		// main app's db.Open runs, so we must ensure the parent directory
		// exists here as well. Without this, the driver returns CANTOPEN(14),
		// which modernc.org/sqlite reports with the misleading message
		// "unable to open database file: out of memory (14)".
		if err := ensureSQLiteParentDir(cfg.DBDSN); err != nil {
			return fmt.Errorf("prepare sqlite path: %w", err)
		}
		dbURL = "sqlite://" + cfg.DBDSN
	case config.DriverPostgres:
		sub = "postgres"
		dbURL = "pgx5://" + trimURIScheme(cfg.DBDSN)
	default:
		return fmt.Errorf("unsupported driver %q", cfg.DBDriver)
	}

	sourceURL := "file://" + filepath.ToSlash(filepath.Join(migrationsRoot, sub))

	m, err := migrate.New(sourceURL, dbURL)
	if err != nil {
		return fmt.Errorf("migrate new: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("migrate up: %w", err)
	}
	return nil
}

func trimURIScheme(dsn string) string {
	for _, p := range []string{"postgres://", "postgresql://"} {
		if len(dsn) >= len(p) && dsn[:len(p)] == p {
			return dsn[len(p):]
		}
	}
	return dsn
}
