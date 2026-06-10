package db

import (
	"context"
	"path/filepath"
	"testing"
)

func TestOpen_CreatesDBAndPings(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test.db")

	pools, err := Open(context.Background(), dbPath)
	if err != nil {
		t.Fatalf("Open returned error: %v", err)
	}
	t.Cleanup(func() { _ = pools.Close() })

	if pools.Reader == nil || pools.Writer == nil {
		t.Fatal("Open returned nil pools")
	}
	if pools.Path == "" {
		t.Fatal("Open returned empty Path")
	}
}

func TestOpen_WriterPoolIsSingleConn(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test.db")

	pools, err := Open(context.Background(), dbPath)
	if err != nil {
		t.Fatalf("Open returned error: %v", err)
	}
	t.Cleanup(func() { _ = pools.Close() })

	stats := pools.Writer.Stats()
	if stats.MaxOpenConnections != 1 {
		t.Fatalf("writer MaxOpenConnections = %d, want 1 (SQLite is single-writer)", stats.MaxOpenConnections)
	}
}

func TestMigrate_CreatesAllTables(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test.db")
	ctx := context.Background()

	pools, err := Open(ctx, dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = pools.Close() })

	if err := pools.Migrate(ctx); err != nil {
		t.Fatalf("Migrate: %v", err)
	}

	wantTables := []string{
		"saved_searches",
		"listings",
		"price_observations",
		"listing_photos",
		"listing_params",
		"alerts_sent",
		"exchange_rates",
		"app_state",
	}
	for _, table := range wantTables {
		var name string
		err := pools.Reader.QueryRowContext(ctx,
			`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table,
		).Scan(&name)
		if err != nil {
			t.Errorf("table %q not present after migrate: %v", table, err)
		}
	}
}

func TestMigrate_Idempotent(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test.db")
	ctx := context.Background()

	pools, err := Open(ctx, dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = pools.Close() })

	if err := pools.Migrate(ctx); err != nil {
		t.Fatalf("Migrate (1st): %v", err)
	}
	if err := pools.Migrate(ctx); err != nil {
		t.Fatalf("Migrate (2nd): %v", err)
	}
}
