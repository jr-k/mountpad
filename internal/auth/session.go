package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"time"

	"github.com/mountpad/mountpad/internal/models"
	"github.com/mountpad/mountpad/internal/repositories"
)

const SessionCookieName = "mountpad_sid"

type SessionManager struct {
	Repo     *repositories.SessionsRepo
	Users    *repositories.UsersRepo
	Lifetime time.Duration
	Secure   bool
}

func NewSessionManager(repo *repositories.SessionsRepo, users *repositories.UsersRepo, lifetime time.Duration, secure bool) *SessionManager {
	return &SessionManager{Repo: repo, Users: users, Lifetime: lifetime, Secure: secure}
}

func (m *SessionManager) Create(ctx context.Context, w http.ResponseWriter, userID int64) (*models.Session, error) {
	id, err := generateID(32)
	if err != nil {
		return nil, err
	}
	s := &models.Session{
		ID:        id,
		UserID:    userID,
		ExpiresAt: time.Now().UTC().Add(m.Lifetime),
	}
	if err := m.Repo.Create(ctx, s); err != nil {
		return nil, err
	}
	m.setCookie(w, s.ID, s.ExpiresAt)
	return s, nil
}

func (m *SessionManager) Resolve(ctx context.Context, r *http.Request) (*models.User, *models.Session, error) {
	c, err := r.Cookie(SessionCookieName)
	if err != nil {
		return nil, nil, http.ErrNoCookie
	}
	s, err := m.Repo.Get(ctx, c.Value)
	if err != nil {
		return nil, nil, err
	}
	if time.Now().After(s.ExpiresAt) {
		_ = m.Repo.Delete(ctx, s.ID)
		return nil, nil, http.ErrNoCookie
	}
	u, err := m.Users.GetByID(ctx, s.UserID)
	if err != nil {
		return nil, nil, err
	}
	if !u.IsActive {
		return nil, nil, http.ErrNoCookie
	}
	u.GroupIDs, _ = m.Users.GroupIDsFor(ctx, u.ID)
	return u, s, nil
}

func (m *SessionManager) Destroy(ctx context.Context, w http.ResponseWriter, sid string) {
	_ = m.Repo.Delete(ctx, sid)
	m.clearCookie(w)
}

func (m *SessionManager) setCookie(w http.ResponseWriter, value string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    value,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   m.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (m *SessionManager) clearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   m.Secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func generateID(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
