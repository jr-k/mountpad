package main

import (
	"context"
	"errors"
	stdhttp "net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"log/slog"

	"github.com/mountpad/mountpad/internal/acl"
	"github.com/mountpad/mountpad/internal/auth"
	"github.com/mountpad/mountpad/internal/config"
	"github.com/mountpad/mountpad/internal/db"
	mphttp "github.com/mountpad/mountpad/internal/http"
	"github.com/mountpad/mountpad/internal/inertia"
	"github.com/mountpad/mountpad/internal/manifests"
	"github.com/mountpad/mountpad/internal/mountpoints"
	"github.com/mountpad/mountpad/internal/repositories"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config load failed", "err", err)
		os.Exit(1)
	}

	if err := db.Migrate(cfg, "migrations"); err != nil {
		logger.Error("migrate failed", "err", err)
		os.Exit(1)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	d, err := db.Open(ctx, cfg)
	if err != nil {
		logger.Error("db open failed", "err", err)
		os.Exit(1)
	}
	defer d.Close()

	users := repositories.NewUsersRepo(d)
	groups := repositories.NewGroupsRepo(d)
	mountsRepo := repositories.NewMountPointsRepo(d)
	sessionsRepo := repositories.NewSessionsRepo(d)

	sessions := auth.NewSessionManager(sessionsRepo, users, cfg.SessionLifetime, cfg.CookieSecure)
	gate := auth.NewGate(sessions, users, cfg.SafeMode)
	mountsSvc := mountpoints.NewService(mountsRepo)
	mfStore := manifests.NewStore(cfg.ManifestFilename)
	resolver := acl.NewResolver(mfStore)

	i, err := inertia.New(cfg, sessions, mountsRepo)
	if err != nil {
		logger.Error("inertia init failed", "err", err)
		os.Exit(1)
	}

	handler := mphttp.NewRouter(&mphttp.Deps{
		Cfg:       cfg,
		Inertia:   i,
		Sessions:  sessions,
		Gate:      gate,
		Users:     users,
		Groups:    groups,
		Mounts:    mountsRepo,
		MountsSvc: mountsSvc,
		Manifest:  mfStore,
		Resolver:  resolver,
	})

	srv := &stdhttp.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				_ = sessionsRepo.PurgeExpired(ctx)
			}
		}
	}()

	setupDone := gate.IsAuthEnabled(ctx)
	logger.Info("MountPad listening",
		"addr", cfg.HTTPAddr,
		"driver", cfg.DBDriver,
		"env", cfg.Env,
		"setup_done", setupDone,
		"safe_mode", cfg.SafeMode,
	)
	if cfg.SafeMode {
		logger.Warn("SAFE_MODE is ON: authentication bypassed; disable in production")
	} else if !setupDone {
		logger.Info("first-time setup pending: visit /setup to create the initial administrator")
	}

	errCh := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, stdhttp.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		logger.Info("shutting down")
	case err := <-errCh:
		logger.Error("http server error", "err", err)
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	_ = srv.Shutdown(shutdownCtx)
}
