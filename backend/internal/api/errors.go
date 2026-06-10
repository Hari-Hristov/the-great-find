package api

import "errors"

// ErrNotFound is returned by store methods when a UPDATE/DELETE matched zero rows.
// Handlers translate this to huma.Error404NotFound.
var ErrNotFound = errors.New("api: row not found")
