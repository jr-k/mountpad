package repositories

import (
	"context"
	"database/sql"
	"errors"

	"github.com/mountpad/mountpad/internal/db"
	"github.com/mountpad/mountpad/internal/models"
)

type MountPointsRepo struct{ DB *db.DB }

func NewMountPointsRepo(d *db.DB) *MountPointsRepo { return &MountPointsRepo{DB: d} }

const mpCols = "id, slug, name, description, host_path, is_active, default_owner_id, default_group_id, default_mode, created_at, updated_at"

func scanMP(row interface{ Scan(...any) error }) (*models.MountPoint, error) {
	var m models.MountPoint
	var ownerID, groupID sql.NullInt64
	var mode int64
	if err := row.Scan(&m.ID, &m.Slug, &m.Name, &m.Description, &m.HostPath, &m.IsActive,
		&ownerID, &groupID, &mode, &m.CreatedAt, &m.UpdatedAt); err != nil {
		return nil, err
	}
	if ownerID.Valid {
		v := ownerID.Int64
		m.DefaultOwnerID = &v
	}
	if groupID.Valid {
		v := groupID.Int64
		m.DefaultGroupID = &v
	}
	m.DefaultMode = uint16(mode)
	return &m, nil
}

func (r *MountPointsRepo) List(ctx context.Context) ([]*models.MountPoint, error) {
	rows, err := r.DB.QueryContext(ctx, "SELECT "+mpCols+" FROM mount_points ORDER BY slug")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*models.MountPoint
	for rows.Next() {
		m, err := scanMP(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *MountPointsRepo) ListActive(ctx context.Context) ([]*models.MountPoint, error) {
	rows, err := r.DB.QueryContext(ctx, "SELECT "+mpCols+" FROM mount_points WHERE is_active = TRUE ORDER BY slug")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*models.MountPoint
	for rows.Next() {
		m, err := scanMP(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *MountPointsRepo) GetByID(ctx context.Context, id int64) (*models.MountPoint, error) {
	q := r.DB.Placeholder("SELECT " + mpCols + " FROM mount_points WHERE id = ?")
	m, err := scanMP(r.DB.QueryRowContext(ctx, q, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, db.ErrNotFound
	}
	return m, err
}

func (r *MountPointsRepo) GetBySlug(ctx context.Context, slug string) (*models.MountPoint, error) {
	q := r.DB.Placeholder("SELECT " + mpCols + " FROM mount_points WHERE slug = ?")
	m, err := scanMP(r.DB.QueryRowContext(ctx, q, slug))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, db.ErrNotFound
	}
	return m, err
}

func (r *MountPointsRepo) Create(ctx context.Context, m *models.MountPoint) error {
	q := r.DB.Placeholder(`INSERT INTO mount_points
		(slug, name, description, host_path, is_active, default_owner_id, default_group_id, default_mode)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	if r.DB.Driver == "postgres" {
		q += " RETURNING id"
		return r.DB.QueryRowContext(ctx, q, m.Slug, m.Name, m.Description, m.HostPath, m.IsActive,
			m.DefaultOwnerID, m.DefaultGroupID, int64(m.DefaultMode)).Scan(&m.ID)
	}
	res, err := r.DB.ExecContext(ctx, q, m.Slug, m.Name, m.Description, m.HostPath, m.IsActive,
		m.DefaultOwnerID, m.DefaultGroupID, int64(m.DefaultMode))
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	m.ID = id
	return err
}

func (r *MountPointsRepo) Update(ctx context.Context, m *models.MountPoint) error {
	q := r.DB.Placeholder(`UPDATE mount_points SET
		slug = ?, name = ?, description = ?, host_path = ?, is_active = ?,
		default_owner_id = ?, default_group_id = ?, default_mode = ?,
		updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
	_, err := r.DB.ExecContext(ctx, q, m.Slug, m.Name, m.Description, m.HostPath, m.IsActive,
		m.DefaultOwnerID, m.DefaultGroupID, int64(m.DefaultMode), m.ID)
	return err
}

func (r *MountPointsRepo) Delete(ctx context.Context, id int64) error {
	q := r.DB.Placeholder("DELETE FROM mount_points WHERE id = ?")
	_, err := r.DB.ExecContext(ctx, q, id)
	return err
}
