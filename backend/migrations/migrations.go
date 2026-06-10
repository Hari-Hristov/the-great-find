// Package migrations only exists to host the //go:embed of the SQL migration files.
//
// Living at backend/migrations/migrations.go keeps the .sql files at their canonical
// path (callable directly by goose CLI for local dev: `goose sqlite3 ./db.sqlite up`)
// while still letting the binary embed them at compile time.
package migrations

import (
	"embed"
	"io/fs"
)

//go:embed *.sql
var FS embed.FS

// Sub returns an fs.FS rooted at the migrations directory itself (no subpath prefix).
// Hand this to goose.SetBaseFS / goose.UpContext.
func Sub() fs.FS { return FS }
