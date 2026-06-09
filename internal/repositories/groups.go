package repositories

import (
	"context"
	"database/sql"
	"errors"

	"github.com/mountpad/mountpad/internal/db"
	"github.com/mountpad/mountpad/internal/models"
)

type GroupsRepo struct{ DB *db.DB }

func NewGroupsRepo(d *db.DB) *GroupsRepo { return &GroupsRepo{DB: d} }

const groupCols = "id, name, description, avatar_color, created_at, updated_at"

func scanGroup(row interface{ Scan(...any) error }) (*models.Group, error) {
	var g models.Group
	if err := row.Scan(&g.ID, &g.Name, &g.Description, &g.AvatarColor, &g.CreatedAt, &g.UpdatedAt); err != nil {
		return nil, err
	}
	return &g, nil
}

func (r *GroupsRepo) List(ctx context.Context) ([]*models.Group, error) {
	rows, err := r.DB.QueryContext(ctx, "SELECT "+groupCols+" FROM groups ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*models.Group
	for rows.Next() {
		g, err := scanGroup(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func (r *GroupsRepo) GetByID(ctx context.Context, id int64) (*models.Group, error) {
	q := r.DB.Placeholder("SELECT " + groupCols + " FROM groups WHERE id = ?")
	g, err := scanGroup(r.DB.QueryRowContext(ctx, q, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, db.ErrNotFound
	}
	return g, err
}

func (r *GroupsRepo) GetByName(ctx context.Context, name string) (*models.Group, error) {
	q := r.DB.Placeholder("SELECT " + groupCols + " FROM groups WHERE name = ?")
	g, err := scanGroup(r.DB.QueryRowContext(ctx, q, name))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, db.ErrNotFound
	}
	return g, err
}

func (r *GroupsRepo) Create(ctx context.Context, g *models.Group) error {
	q := r.DB.Placeholder("INSERT INTO groups (name, description, avatar_color) VALUES (?, ?, ?)")
	if r.DB.Driver == "postgres" {
		q += " RETURNING id"
		return r.DB.QueryRowContext(ctx, q, g.Name, g.Description, g.AvatarColor).Scan(&g.ID)
	}
	res, err := r.DB.ExecContext(ctx, q, g.Name, g.Description, g.AvatarColor)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	g.ID = id
	return err
}

func (r *GroupsRepo) Update(ctx context.Context, g *models.Group) error {
	q := r.DB.Placeholder(`UPDATE groups SET name = ?, description = ?, avatar_color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
	_, err := r.DB.ExecContext(ctx, q, g.Name, g.Description, g.AvatarColor, g.ID)
	return err
}

func (r *GroupsRepo) Delete(ctx context.Context, id int64) error {
	q := r.DB.Placeholder("DELETE FROM groups WHERE id = ?")
	_, err := r.DB.ExecContext(ctx, q, id)
	return err
}
