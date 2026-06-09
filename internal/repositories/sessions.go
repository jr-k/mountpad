package repositories

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/mountpad/mountpad/internal/db"
	"github.com/mountpad/mountpad/internal/models"
)

type SessionsRepo struct{ DB *db.DB }

func NewSessionsRepo(d *db.DB) *SessionsRepo { return &SessionsRepo{DB: d} }

func (r *SessionsRepo) Create(ctx context.Context, s *models.Session) error {
	q := r.DB.Placeholder("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
	_, err := r.DB.ExecContext(ctx, q, s.ID, s.UserID, s.ExpiresAt.UTC())
	return err
}

func (r *SessionsRepo) Get(ctx context.Context, id string) (*models.Session, error) {
	q := r.DB.Placeholder("SELECT id, user_id, expires_at, created_at FROM sessions WHERE id = ?")
	var s models.Session
	err := r.DB.QueryRowContext(ctx, q, id).Scan(&s.ID, &s.UserID, &s.ExpiresAt, &s.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, db.ErrNotFound
	}
	return &s, err
}

func (r *SessionsRepo) Delete(ctx context.Context, id string) error {
	q := r.DB.Placeholder("DELETE FROM sessions WHERE id = ?")
	_, err := r.DB.ExecContext(ctx, q, id)
	return err
}

func (r *SessionsRepo) PurgeExpired(ctx context.Context) error {
	q := r.DB.Placeholder("DELETE FROM sessions WHERE expires_at < ?")
	_, err := r.DB.ExecContext(ctx, q, time.Now().UTC())
	return err
}
