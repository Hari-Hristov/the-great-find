package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Hari-Hristov/the-great-find/backend/internal/api"
	"github.com/Hari-Hristov/the-great-find/backend/internal/apiclient"
	"github.com/Hari-Hristov/the-great-find/backend/internal/db"
	"github.com/Hari-Hristov/the-great-find/backend/internal/db/store"
	"github.com/Hari-Hristov/the-great-find/backend/internal/events"
	"github.com/Hari-Hristov/the-great-find/backend/internal/notify"
	"github.com/Hari-Hristov/the-great-find/backend/internal/parser"
	"github.com/Hari-Hristov/the-great-find/backend/internal/paths"
	"github.com/Hari-Hristov/the-great-find/backend/internal/politehttp"
	"github.com/Hari-Hristov/the-great-find/backend/internal/scheduler"
	"github.com/Hari-Hristov/the-great-find/backend/internal/scraper"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	dataDir, err := paths.DataDir()
	if err != nil {
		return fmt.Errorf("resolve data dir: %w", err)
	}
	slog.Info("data dir", "path", dataDir)

	dbPath, err := paths.DBPath()
	if err != nil {
		return fmt.Errorf("resolve db path: %w", err)
	}

	pools, err := db.Open(ctx, dbPath)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer func() {
		if cerr := pools.Close(); cerr != nil {
			slog.Error("close db", "err", cerr)
		}
	}()

	if err := pools.Migrate(ctx); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	slog.Info("db: migrations up-to-date")

	// Startup retention sweep — same predicate as the AFTER INSERT trigger from
	// migration 0007. Covers the case where the app sat idle for >120 days with
	// no new inserts to fire the trigger.
	if res, err := pools.Writer.ExecContext(ctx,
		`DELETE FROM listings
		 WHERE datetime(COALESCE(posted_at, scraped_first_at))
		       < datetime('now', '-120 days')`); err != nil {
		slog.Warn("startup retention sweep failed", "err", err)
	} else if n, _ := res.RowsAffected(); n > 0 {
		slog.Info("startup retention sweep: pruned listings", "count", n)
	}

	parserCfg, err := parser.EmbeddedOLXBG()
	if err != nil {
		return fmt.Errorf("load embedded parser config: %w", err)
	}
	parserStore := parser.NewStore(parserCfg)

	// One HostGate shared across every outbound HTTP path so the per-host
	// politeness budget covers BOTH ingestion paths. Doubling that up by
	// giving each client its own gate would silently double effective load.
	hostGate := politehttp.NewHostGate()

	scraperClient, err := scraper.NewClient(parserStore, nil, hostGate)
	if err != nil {
		return fmt.Errorf("scraper: %w", err)
	}

	// Pick the active fetcher at boot. Hot-reload of the parser config does NOT
	// swap fetchers mid-run — adding/removing the `api` block requires a restart.
	var fetcher scheduler.Fetcher
	if parserStore.Get().API != nil {
		apiClient, err := apiclient.NewClient(parserStore, nil, hostGate)
		if err != nil {
			return fmt.Errorf("apiclient: %w", err)
		}
		fetcher = apiClient
		slog.Info("ingestion: using JSON API path", "endpoint", parserStore.Get().API.ListPath)
	} else {
		fetcher = scraperClient
		slog.Info("ingestion: using HTML scraper path (no api block in parser config)")
	}

	bus := events.NewBus(64)

	queries := store.New(pools)

	smtpCfg, err := api.LoadSMTPConfig(ctx, queries)
	if err != nil {
		slog.Warn("could not load SMTP config, email notifications disabled", "err", err)
	}
	notifySvc := notify.New(smtpCfg, slog.Default())
	notifySvc.SetConfigLoader(func() (notify.SMTPConfig, error) {
		return api.LoadSMTPConfig(context.Background(), queries)
	})
	go notifySvc.Run(ctx, bus)

	sched := scheduler.New(queries, fetcher, parserStore, bus, slog.Default())
	if err := sched.Start(ctx); err != nil {
		bus.Close()
		return fmt.Errorf("scheduler start: %w", err)
	}
	slog.Info("scheduler: started")

	cleanedUp := false
	cleanup := func() {
		if cleanedUp {
			return
		}
		cleanedUp = true
		sched.Stop()
		bus.Close()
	}
	defer cleanup()

	// BACKEND_PORT pins the listener port for local dev (Vite proxies /api → :8088
	// by default). Empty / "0" → OS picks one, intended for the embedded prod binary.
	port := os.Getenv("BACKEND_PORT")
	if port == "" {
		port = "8088"
	}
	listener, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil {
		return fmt.Errorf("bind listener on port %s: %w", port, err)
	}
	addr := listener.Addr().(*net.TCPAddr)
	slog.Info("listening", "url", fmt.Sprintf("http://127.0.0.1:%d", addr.Port))

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.Handle("/api/", http.StripPrefix("/api", api.New(queries, sched, parserStore)))
	mux.Handle("/events", api.NewSSE(bus))

	server := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	serverErr := make(chan error, 1)
	go func() {
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	select {
	case err := <-serverErr:
		return fmt.Errorf("server: %w", err)
	case <-ctx.Done():
		slog.Info("shutting down")
	}

	// Stop the scheduler first so all in-flight polls finish and the event bus
	// drains before we ask the HTTP server to close. SSE handlers block until
	// bus.Close() closes their channel — shutting those down before calling
	// server.Shutdown means the server has no long-lived connections left to
	// drain and won't race against the timeout.
	cleanup()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	return nil
}
