// Package parser includes an embedded snapshot of parser-config/olx-bg.json from
// the repo root. This snapshot is the fallback when the remote fetch fails (offline,
// GitHub down, schema validation rejects the remote).
//
// The canonical version of this file lives at <repo-root>/parser-config/olx-bg.json
// and is served from a public GitHub URL we own. To keep the embedded copy in sync,
// run `make sync-parser-config` from the backend directory.
package parser

import _ "embed"

//go:embed embedded/olx-bg.json
var embeddedOLXBGRaw []byte

// EmbeddedOLXBG returns the bundled-at-build-time parser config for olx.bg.
// Always validate before using; this is the fallback path so it must be sound.
func EmbeddedOLXBG() (*Config, error) {
	return Decode(embeddedOLXBGRaw)
}
