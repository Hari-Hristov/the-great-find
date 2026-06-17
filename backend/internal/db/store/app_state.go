package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// GetAppState returns the value for key from the app_state table.
// Returns ("", nil) when the key does not exist.
func (s *Store) GetAppState(ctx context.Context, key string) (string, error) {
	const q = `SELECT value FROM app_state WHERE key = ?`
	var val string
	err := s.pools.Reader.QueryRowContext(ctx, q, key).Scan(&val)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("get app_state %q: %w", key, err)
	}
	return val, nil
}

// SetAppState upserts key/value in the app_state table.
func (s *Store) SetAppState(ctx context.Context, key, value string) error {
	const q = `INSERT INTO app_state (key, value) VALUES (?, ?)
	           ON CONFLICT (key) DO UPDATE SET value = excluded.value`
	_, err := s.pools.Writer.ExecContext(ctx, q, key, value)
	if err != nil {
		return fmt.Errorf("set app_state %q: %w", key, err)
	}
	return nil
}
