package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"

	"github.com/mountpad/mountpad/internal/config"
)

type DB struct {
	*sql.DB
	Driver config.DBDriver
}

func Open(ctx context.Context, cfg *config.Config) (*DB, error) {
	var driverName string
	switch cfg.DBDriver {
	case config.DriverSQLite:
		driverName = "sqlite"
		if err := ensureSQLiteParentDir(cfg.DBDSN); err != nil {
			return nil, fmt.Errorf("prepare sqlite path: %w", err)
		}
	case config.DriverPostgres:
		driverName = "pgx"
	default:
		return nil, fmt.Errorf("unsupported driver %q", cfg.DBDriver)
	}

	sqlDB, err := sql.Open(driverName, cfg.DBDSN)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	switch cfg.DBDriver {
	case config.DriverSQLite:
		sqlDB.SetMaxOpenConns(1)
	case config.DriverPostgres:
		sqlDB.SetMaxOpenConns(25)
		sqlDB.SetMaxIdleConns(5)
		sqlDB.SetConnMaxLifetime(30 * time.Minute)
	}

	pctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := sqlDB.PingContext(pctx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}

	return &DB{DB: sqlDB, Driver: cfg.DBDriver}, nil
}

// Placeholder rewrites "?" placeholders to the driver-appropriate form.
// Repositories should ALWAYS write queries with "?" and call this helper.
func (db *DB) Placeholder(query string) string {
	if db.Driver != config.DriverPostgres {
		return query
	}
	out := make([]byte, 0, len(query)+8)
	idx := 1
	for i := 0; i < len(query); i++ {
		if query[i] == '?' {
			out = append(out, fmt.Sprintf("$%d", idx)...)
			idx++
			continue
		}
		out = append(out, query[i])
	}
	return string(out)
}

func (db *DB) Now() time.Time { return time.Now().UTC() }

var ErrNotFound = errors.New("not found")

// ensureSQLiteParentDir extracts the file path from a SQLite DSN
// (e.g. "file:/db/mountpad.db?_pragma=foreign_keys(1)") and
// creates the parent directory if missing. The modernc.org/sqlite driver
// does not create intermediate directories on its own.
func ensureSQLiteParentDir(dsn string) error {
	path := dsn
	if i := strings.IndexByte(path, '?'); i >= 0 {
		path = path[:i]
	}
	path = strings.TrimPrefix(path, "file:")
	if path == "" || path == ":memory:" {
		return nil
	}
	dir := filepath.Dir(path)
	if dir == "" || dir == "." {
		return nil
	}
	return os.MkdirAll(dir, 0o755)
}
