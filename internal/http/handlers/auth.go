package handlers

import (
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"sync"
	"time"

	gonertia "github.com/romsar/gonertia"

	"github.com/mountpad/mountpad/internal/auth"
	"github.com/mountpad/mountpad/internal/inertia"
	"github.com/mountpad/mountpad/internal/models"
	"github.com/mountpad/mountpad/internal/repositories"
)

type AuthHandler struct {
	Sessions *auth.SessionManager
	Gate     *auth.Gate
	Users    *repositories.UsersRepo
	Inertia  *gonertia.Inertia

	limiter *loginLimiter
}

func NewAuthHandler(s *auth.SessionManager, g *auth.Gate, u *repositories.UsersRepo, i *gonertia.Inertia) *AuthHandler {
	return &AuthHandler{Sessions: s, Gate: g, Users: u, Inertia: i, limiter: newLoginLimiter(10, time.Minute)}
}

// GET /login: Inertia page.
//
// Routing rules:
//   - If safe-mode is on or auth is enabled normally, render the form.
//   - If auth is disabled and the wizard has already been completed (i.e.
//     someone disabled auth from the access page), go straight to the
//     workspace.
//   - If auth is disabled and there are *no* users, bounce to /setup so the
//     wizard is the only thing the operator can see.
func (h *AuthHandler) ShowLogin(w http.ResponseWriter, r *http.Request) {
	if h.Gate.SafeMode {
		http.Redirect(w, r, "/workspace", http.StatusSeeOther)
		return
	}
	if !h.Gate.IsAuthEnabled(r.Context()) {
		if h.Gate.UserCount(r.Context()) == 0 {
			http.Redirect(w, r, "/setup", http.StatusSeeOther)
			return
		}
		http.Redirect(w, r, "/workspace", http.StatusSeeOther)
		return
	}
	_ = h.Inertia.Render(w, r, "LoginPage", inertia.SharedProps(r, h.Gate, nil, nil))
}

type loginPayload struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// POST /login: exchange credentials for a session cookie. Refused when auth
// is currently disabled (no users to authenticate against).
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.Gate.IsAuthEnabled(r.Context()) && !h.Gate.SafeMode {
		http.Error(w, "authentication is disabled", http.StatusBadRequest)
		return
	}
	ip := clientIP(r)
	if !h.limiter.Allow(ip) {
		http.Error(w, "too many attempts", http.StatusTooManyRequests)
		return
	}

	var p loginPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	p.Username = strings.TrimSpace(p.Username)
	if p.Username == "" || p.Password == "" {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	u, err := h.Users.GetByUsername(r.Context(), p.Username)
	if err != nil || !u.IsActive || !auth.VerifyPassword(u.PasswordHash, p.Password) {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	if _, err := h.Sessions.Create(r.Context(), w, u.ID); err != nil {
		http.Error(w, "session error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if s := auth.SessionFrom(r.Context()); s != nil {
		h.Sessions.Destroy(r.Context(), w, s.ID)
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	if u == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id": u.ID, "username": u.Username,
		"display_name": u.DisplayName,
		"first_name":   u.FirstName,
		"last_name":    u.LastName,
		"email":        u.Email,
		"avatar_color": u.AvatarColor,
		"is_admin":     u.IsAdmin,
		"group_ids":    u.GroupIDs,
		"synthetic":    auth.IsSynthetic(u),
	})
}

// GET /api/auth/status: public; tells the frontend whether to show the
// login form, the setup wizard, or just nothing.
func (h *AuthHandler) Status(w http.ResponseWriter, r *http.Request) {
	enabled := h.Gate.IsAuthEnabled(r.Context())
	count := h.Gate.UserCount(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":    enabled,
		"safe_mode":  h.Gate.SafeMode,
		"user_count": count,
	})
}

type setupPayload struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

// POST /api/auth/setup: public when auth is disabled. Creates the first
// administrator and flips the auth.enabled flag. Idempotent only on first
// run: once auth is enabled, this endpoint returns 409.
func (h *AuthHandler) Setup(w http.ResponseWriter, r *http.Request) {
	if h.Gate.IsAuthEnabled(r.Context()) {
		http.Error(w, "auth already enabled; use the users page", http.StatusConflict)
		return
	}
	var p setupPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	p.Username = strings.TrimSpace(p.Username)
	if p.Username == "" || p.Password == "" {
		http.Error(w, "username and password required", http.StatusBadRequest)
		return
	}
	if existing, err := h.Users.GetByUsername(r.Context(), p.Username); err == nil && existing != nil {
		// Username already taken from a previous setup attempt.
		http.Error(w, "username already exists", http.StatusConflict)
		return
	}
	hash, err := auth.HashPassword(p.Password)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	u := &models.User{
		Username: p.Username, DisplayName: p.DisplayName, PasswordHash: hash,
		IsAdmin: true, IsActive: true,
	}
	if err := h.Users.Create(r.Context(), u); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	// Flip the cached "setup is done" flag synchronously so the next
	// request (typically the Inertia reload triggered by the wizard)
	// doesn't get re-routed back to /setup before the users-table query
	// catches up. From here on, auth is permanently enforced.
	h.Gate.SetupCompleted()
	if _, err := h.Sessions.Create(r.Context(), w, u.ID); err != nil {
		http.Error(w, "session error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "user_id": u.ID})
}

// ---- small helpers ----

func clientIP(r *http.Request) string {
	if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
		if i := strings.IndexByte(xf, ','); i >= 0 {
			return strings.TrimSpace(xf[:i])
		}
		return strings.TrimSpace(xf)
	}
	return r.RemoteAddr
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// Normalize nil slices to "[]" so frontends can safely call .map without
	// guarding against null. encoding/json marshals a nil slice as "null"
	// otherwise, which breaks paginated list pages.
	if v := reflect.ValueOf(body); v.IsValid() && v.Kind() == reflect.Slice && v.IsNil() {
		_, _ = w.Write([]byte("[]\n"))
		return
	}
	_ = json.NewEncoder(w).Encode(body)
}

// loginLimiter is a tiny per-IP sliding-window limiter used only for /login.
type loginLimiter struct {
	mu     sync.Mutex
	bucket map[string][]time.Time
	max    int
	window time.Duration
}

func newLoginLimiter(max int, window time.Duration) *loginLimiter {
	return &loginLimiter{bucket: map[string][]time.Time{}, max: max, window: window}
}

func (l *loginLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-l.window)
	hits := l.bucket[key]
	out := hits[:0]
	for _, t := range hits {
		if t.After(cutoff) {
			out = append(out, t)
		}
	}
	if len(out) >= l.max {
		l.bucket[key] = out
		return false
	}
	out = append(out, now)
	l.bucket[key] = out
	return true
}
