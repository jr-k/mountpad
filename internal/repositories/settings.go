package repositories

import (
	"context"
	"database/sql"
	"errors"

	"github.com/mountpad/mountpad/internal/db"
)

type SettingsRepo struct{ DB *db.DB }

func NewSettingsRepo(d *db.DB) *SettingsRepo { return &SettingsRepo{DB: d} }

func (r *SettingsRepo) Get(ctx context.Context, key string) (string, error) {
	q := r.DB.Placeholder("SELECT value FROM app_settings WHERE key = ?")
	var v string
	err := r.DB.QueryRowContext(ctx, q, key).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return "", db.ErrNotFound
	}
	return v, err
}

func (r *SettingsRepo) Set(ctx context.Context, key, value string) error {
	var q string
	if r.DB.Driver == "postgres" {
		q = `INSERT INTO app_settings (key, value) VALUES ($1, $2)
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`
	} else {
		q = `INSERT INTO app_settings (key, value) VALUES (?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
	}
	_, err := r.DB.ExecContext(ctx, q, key, value)
	return err
}
