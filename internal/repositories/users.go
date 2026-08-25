package repositories

import (
	"context"
	"database/sql"
	"errors"

	"github.com/mountpad/mountpad/internal/db"
	"github.com/mountpad/mountpad/internal/models"
)

type UsersRepo struct{ DB *db.DB }

func NewUsersRepo(d *db.DB) *UsersRepo { return &UsersRepo{DB: d} }

var ErrLastActiveAdmin = errors.New("last active administrator")

// Keep this column list synchronised with `scanUser`. Profile fields
// (first_name/last_name/email/avatar_color) were added in migration 0002
// and default to empty strings server-side so old rows scan cleanly.
const userCols = "id, username, display_name, first_name, last_name, email, avatar_color, password_hash, is_admin, is_active, created_at, updated_at"

func scanUser(row interface{ Scan(...any) error }) (*models.User, error) {
	var u models.User
	if err := row.Scan(
		&u.ID, &u.Username, &u.DisplayName,
		&u.FirstName, &u.LastName, &u.Email, &u.AvatarColor,
		&u.PasswordHash, &u.IsAdmin, &u.IsActive,
		&u.CreatedAt, &u.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UsersRepo) GetByID(ctx context.Context, id int64) (*models.User, error) {
	q := r.DB.Placeholder("SELECT " + userCols + " FROM users WHERE id = ?")
	u, err := scanUser(r.DB.QueryRowContext(ctx, q, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, db.ErrNotFound
	}
	return u, err
}

func (r *UsersRepo) GetByUsername(ctx context.Context, username string) (*models.User, error) {
	q := r.DB.Placeholder("SELECT " + userCols + " FROM users WHERE username = ?")
	u, err := scanUser(r.DB.QueryRowContext(ctx, q, username))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, db.ErrNotFound
	}
	return u, err
}

func (r *UsersRepo) List(ctx context.Context) ([]*models.User, error) {
	rows, err := r.DB.QueryContext(ctx, "SELECT "+userCols+" FROM users ORDER BY username")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*models.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (r *UsersRepo) Create(ctx context.Context, u *models.User) error {
	q := r.DB.Placeholder(`INSERT INTO users
		(username, display_name, first_name, last_name, email, avatar_color, password_hash, is_admin, is_active)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	args := []any{
		u.Username, u.DisplayName,
		u.FirstName, u.LastName, u.Email, u.AvatarColor,
		u.PasswordHash, u.IsAdmin, u.IsActive,
	}
	if r.DB.Driver == "postgres" {
		q += " RETURNING id"
		return r.DB.QueryRowContext(ctx, q, args...).Scan(&u.ID)
	}
	res, err := r.DB.ExecContext(ctx, q, args...)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	u.ID = id
	return nil
}

// Update overwrites every "editable" field on the user. Callers are expected
// to fetch the row first, patch the fields they care about on the struct,
// then call Update. This keeps the SQL simple at the cost of pushing the
// merge logic up the stack, where the handlers know which fields the
// payload mentioned.
func (r *UsersRepo) Update(ctx context.Context, u *models.User) error {
	q := r.DB.Placeholder(`UPDATE users SET
		display_name = ?, first_name = ?, last_name = ?, email = ?, avatar_color = ?,
		is_admin = ?, is_active = ?,
		updated_at = CURRENT_TIMESTAMP
		WHERE id = ?`)
	_, err := r.DB.ExecContext(ctx, q,
		u.DisplayName, u.FirstName, u.LastName, u.Email, u.AvatarColor,
		u.IsAdmin, u.IsActive,
		u.ID,
	)
	return err
}

func (r *UsersRepo) UpdatePassword(ctx context.Context, id int64, hash string) error {
	q := r.DB.Placeholder("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
	_, err := r.DB.ExecContext(ctx, q, hash, id)
	return err
}

type UserChanges struct {
	DisplayName  *string
	FirstName    *string
	LastName     *string
	Email        *string
	AvatarColor  *string
	IsAdmin      *bool
	IsActive     *bool
	PasswordHash *string
}

// UpdateAtomic locks and reloads the current user set before applying the
// requested fields. This prevents concurrent PATCH requests from restoring
// stale profile, role, or activity values and serializes last-admin checks.
func (r *UsersRepo) UpdateAtomic(ctx context.Context, id int64, changes UserChanges) (*models.User, error) {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	users, err := r.lockUsers(ctx, tx)
	if err != nil {
		return nil, err
	}
	var u *models.User
	activeAdmins := 0
	for _, candidate := range users {
		if candidate.IsAdmin && candidate.IsActive {
			activeAdmins++
		}
		if candidate.ID == id {
			u = candidate
		}
	}
	if u == nil {
		return nil, db.ErrNotFound
	}
	wasActiveAdmin := u.IsAdmin && u.IsActive
	if changes.DisplayName != nil {
		u.DisplayName = *changes.DisplayName
	}
	if changes.FirstName != nil {
		u.FirstName = *changes.FirstName
	}
	if changes.LastName != nil {
		u.LastName = *changes.LastName
	}
	if changes.Email != nil {
		u.Email = *changes.Email
	}
	if changes.AvatarColor != nil {
		u.AvatarColor = *changes.AvatarColor
	}
	if changes.IsAdmin != nil {
		u.IsAdmin = *changes.IsAdmin
	}
	if changes.IsActive != nil {
		u.IsActive = *changes.IsActive
	}
	if wasActiveAdmin && (!u.IsAdmin || !u.IsActive) && activeAdmins <= 1 {
		return nil, ErrLastActiveAdmin
	}

	q := r.DB.Placeholder(`UPDATE users SET
		display_name = ?, first_name = ?, last_name = ?, email = ?, avatar_color = ?,
		is_admin = ?, is_active = ?,
		updated_at = CURRENT_TIMESTAMP
		WHERE id = ?`)
	result, err := tx.ExecContext(ctx, q,
		u.DisplayName, u.FirstName, u.LastName, u.Email, u.AvatarColor,
		u.IsAdmin, u.IsActive, u.ID,
	)
	if err != nil {
		return nil, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		return nil, db.ErrNotFound
	}
	if changes.PasswordHash != nil {
		q = r.DB.Placeholder("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
		if _, err := tx.ExecContext(ctx, q, *changes.PasswordHash, u.ID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return u, nil
}

func (r *UsersRepo) Delete(ctx context.Context, id int64) error {
	q := r.DB.Placeholder("DELETE FROM users WHERE id = ?")
	_, err := r.DB.ExecContext(ctx, q, id)
	return err
}

func (r *UsersRepo) DeleteAtomic(ctx context.Context, id int64) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	users, err := r.lockUsers(ctx, tx)
	if err != nil {
		return err
	}
	var target *models.User
	activeAdmins := 0
	for _, candidate := range users {
		if candidate.IsAdmin && candidate.IsActive {
			activeAdmins++
		}
		if candidate.ID == id {
			target = candidate
		}
	}
	if target == nil {
		return db.ErrNotFound
	}
	if target.IsAdmin && target.IsActive && activeAdmins <= 1 {
		return ErrLastActiveAdmin
	}
	q := r.DB.Placeholder("DELETE FROM users WHERE id = ?")
	result, err := tx.ExecContext(ctx, q, id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return db.ErrNotFound
	}
	return tx.Commit()
}

func (r *UsersRepo) lockUsers(ctx context.Context, tx *sql.Tx) ([]*models.User, error) {
	q := "SELECT " + userCols + " FROM users ORDER BY id"
	if r.DB.Driver == "postgres" {
		q += " FOR UPDATE"
	}
	rows, err := tx.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var users []*models.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (r *UsersRepo) GroupIDsFor(ctx context.Context, userID int64) ([]int64, error) {
	q := r.DB.Placeholder("SELECT group_id FROM user_groups WHERE user_id = ?")
	rows, err := r.DB.QueryContext(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func (r *UsersRepo) AddGroup(ctx context.Context, userID, groupID int64) error {
	var q string
	if r.DB.Driver == "postgres" {
		q = "INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING"
	} else {
		q = "INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)"
	}
	_, err := r.DB.ExecContext(ctx, q, userID, groupID)
	return err
}

func (r *UsersRepo) RemoveGroup(ctx context.Context, userID, groupID int64) error {
	q := r.DB.Placeholder("DELETE FROM user_groups WHERE user_id = ? AND group_id = ?")
	_, err := r.DB.ExecContext(ctx, q, userID, groupID)
	return err
}

func (r *UsersRepo) ReplaceGroups(ctx context.Context, userID int64, groupIDs []int64) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var exists int
	q := r.DB.Placeholder("SELECT 1 FROM users WHERE id = ?")
	if r.DB.Driver == "postgres" {
		q += " FOR UPDATE"
	}
	if err := tx.QueryRowContext(ctx, q, userID).Scan(&exists); errors.Is(err, sql.ErrNoRows) {
		return db.ErrNotFound
	} else if err != nil {
		return err
	}
	q = r.DB.Placeholder("DELETE FROM user_groups WHERE user_id = ?")
	if _, err := tx.ExecContext(ctx, q, userID); err != nil {
		return err
	}
	q = r.DB.Placeholder("INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)")
	for _, groupID := range groupIDs {
		if _, err := tx.ExecContext(ctx, q, userID, groupID); err != nil {
			return err
		}
	}
	return tx.Commit()
}
