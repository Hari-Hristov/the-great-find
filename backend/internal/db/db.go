// Package db owns the SQLite connection setup and migration runner.
//
// Two pools are exposed:
//
//   - Reader: high concurrency, used by all read-only queries (dashboard, analytics, scheduler reads).
//   - Writer: MaxOpenConns=1, used by everything that mutates state (scraper upserts, alert dispatch,
//     migrations). SQLite is single-writer at the engine level — funneling all writes through one
//     connection avoids the "database is locked" errors you hit when two goroutines race a write.
//
// WAL is enabled on the writer; readers see committed pages without blocking the active writer.
package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"path/filepath"
	"time"

	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"

	"github.com/Hari-Hristov/the-great-find/backend/migrations"
)

// Pools holds the read and write database handles. Always close both on shutdown.
type Pools struct {
	Reader *sql.DB
	Writer *sql.DB
	Path   string
}

// Open opens (or creates) the SQLite database at dbPath and returns the configured pools.
// Caller must Close() the returned Pools on shutdown.
func Open(ctx context.Context, dbPath string) (*Pools, error) {
	abs, err := filepath.Abs(dbPath)
	if err != nil {
		return nil, fmt.Errorf("resolve db path: %w", err)
	}

	writer, err := openConn(abs, true)
	if err != nil {
		return nil, fmt.Errorf("open writer: %w", err)
	}

	reader, err := openConn(abs, false)
	if err != nil {
		_ = writer.Close()
		return nil, fmt.Errorf("open reader: %w", err)
	}

	if err := pingWithTimeout(ctx, writer); err != nil {
		_ = writer.Close()
		_ = reader.Close()
		return nil, fmt.Errorf("ping writer: %w", err)
	}
	if err := pingWithTimeout(ctx, reader); err != nil {
		_ = writer.Close()
		_ = reader.Close()
		return nil, fmt.Errorf("ping reader: %w", err)
	}

	slog.Info("db: opened", "path", abs)
	return &Pools{Reader: reader, Writer: writer, Path: abs}, nil
}

// Close releases both pools.
func (p *Pools) Close() error {
	var errs []error
	if p.Writer != nil {
		if err := p.Writer.Close(); err != nil {
			errs = append(errs, fmt.Errorf("close writer: %w", err))
		}
	}
	if p.Reader != nil {
		if err := p.Reader.Close(); err != nil {
			errs = append(errs, fmt.Errorf("close reader: %w", err))
		}
	}
	return errors.Join(errs...)
}

// Migrate runs goose-managed migrations (up to latest) against the writer pool.
// Safe to call on every startup — no-op when already at head.
func (p *Pools) Migrate(ctx context.Context) error {
	goose.SetBaseFS(migrations.Sub())
	if err := goose.SetDialect("sqlite3"); err != nil {
		return fmt.Errorf("goose dialect: %w", err)
	}
	// goose's DBVersion call needs a *sql.DB. We use the writer pool because migrations write.
	if err := goose.UpContext(ctx, p.Writer, "."); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	return nil
}

// openConn opens a single SQLite connection (pool) configured for either reads or writes.
//
// PRAGMAs:
//   - journal_mode=WAL        — concurrent reads while a writer holds the connection.
//   - busy_timeout=5000       — wait up to 5s on a locked DB before returning SQLITE_BUSY.
//   - foreign_keys=on         — enforce REFERENCES in the schema (off by default in SQLite).
//   - synchronous=NORMAL      — safe under WAL; faster than FULL.
func openConn(absPath string, writer bool) (*sql.DB, error) {
	q := url.Values{}
	q.Set("_pragma", "journal_mode(WAL)")
	q.Add("_pragma", "busy_timeout(5000)")
	q.Add("_pragma", "foreign_keys(on)")
	q.Add("_pragma", "synchronous(NORMAL)")

	dsn := fmt.Sprintf("file:%s?%s", absPath, q.Encode())

	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}

	if writer {
		// Single writer — eliminates "database is locked" by serializing all writes
		// through one connection. Cheap with our workload (one scraper, one scheduler).
		conn.SetMaxOpenConns(1)
		conn.SetMaxIdleConns(1)
	} else {
		// Readers: a small pool. SQLite read perf saturates fast under contention; 4 is plenty.
		conn.SetMaxOpenConns(4)
		conn.SetMaxIdleConns(2)
	}
	conn.SetConnMaxLifetime(0) // long-lived process; let Go manage eviction

	return conn, nil
}

func pingWithTimeout(ctx context.Context, conn *sql.DB) error {
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return conn.PingContext(pingCtx)
}
