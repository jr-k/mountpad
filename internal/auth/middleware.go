package auth

import (
	"context"
	"net/http"

	"github.com/mountpad/mountpad/internal/models"
)

type ctxKey int

const (
	ctxUserKey ctxKey = iota
	ctxSessionKey
)

func WithUser(ctx context.Context, u *models.User, s *models.Session) context.Context {
	ctx = context.WithValue(ctx, ctxUserKey, u)
	ctx = context.WithValue(ctx, ctxSessionKey, s)
	return ctx
}

func UserFrom(ctx context.Context) *models.User {
	if u, ok := ctx.Value(ctxUserKey).(*models.User); ok {
		return u
	}
	return nil
}

func SessionFrom(ctx context.Context) *models.Session {
	if s, ok := ctx.Value(ctxSessionKey).(*models.Session); ok {
		return s
	}
	return nil
}

// AdminOnly is a free middleware that requires the resolved user to have
// IsAdmin=true. It MUST be placed after a Gate.Required or Gate.Optional.
func AdminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := UserFrom(r.Context())
		if u == nil || !u.IsAdmin {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isAPIRequest(r *http.Request) bool {
	if r.Header.Get("X-Inertia") != "" {
		return true
	}
	if r.URL.Path != "" && len(r.URL.Path) >= 4 && r.URL.Path[:4] == "/api" {
		return true
	}
	return false
}
