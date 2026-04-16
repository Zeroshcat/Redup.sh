// Command server is the Redup backend entrypoint. It owns the process
// lifecycle — config load, Sentry init, gin mode, HTTP server, signal
// handling — and delegates the entire application composition to
// internal/app. See internal/app/app.go for the construction graph.
package main

import (
	"context"
	"errors"
	"log"
	nethttp "net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/gin-gonic/gin"

	"github.com/redup/backend/config"
	"github.com/redup/backend/internal/app"
)

func main() {
	cfg := config.Load()

	if err := cfg.Validate(); err != nil {
		log.Fatalf("config validation failed: %v", err)
	}

	// Sentry is opt-in via SENTRY_DSN. Silent when unset so local dev
	// doesn't spew "sentry not configured" warnings on every boot.
	if cfg.SentryDSN != "" {
		if err := sentry.Init(sentry.ClientOptions{
			Dsn:              cfg.SentryDSN,
			Environment:      cfg.SentryEnvironment,
			AttachStacktrace: true,
			TracesSampleRate: 0.05,
		}); err != nil {
			log.Printf("sentry init failed: %v", err)
		} else {
			log.Printf("sentry enabled (env=%s)", cfg.SentryEnvironment)
			defer sentry.Flush(2 * time.Second)
		}
	}
	gin.SetMode(cfg.GinMode)

	a, err := app.New(cfg)
	if err != nil {
		log.Fatalf("app bootstrap failed: %v", err)
	}

	srv := &nethttp.Server{
		Addr:              ":" + cfg.Port,
		Handler:           a.Router(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      0, // SSE streams need an unbounded write
		IdleTimeout:       120 * time.Second,
	}
	go func() {
		log.Printf("Redup backend listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, nethttp.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	// Graceful shutdown: SIGINT/SIGTERM stops accepting new connections
	// and waits up to 30s for in-flight requests to complete. SSE
	// connections are cut once their client ctx.Done fires, which
	// happens as soon as the listener closes.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutdown signal received, draining…")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
	log.Println("server exited")
}
