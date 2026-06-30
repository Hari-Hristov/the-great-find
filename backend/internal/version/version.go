// Package version exposes build-time metadata. Values default to "dev" /
// empty strings so unit tests and uncompiled `go run` invocations stay
// usable; scripts/build.sh and the GitHub Actions release workflow inject
// the real values via -ldflags -X at compile time.
package version

var (
	// Version is the semantic version (e.g. "0.1.0") or "dev" for local builds.
	Version = "dev"
	// Commit is the short SHA of HEAD at build time.
	Commit = ""
	// Date is the UTC build timestamp in RFC3339 form.
	Date = ""
)

// Info bundles the three values for JSON serialisation.
type Info struct {
	Version string `json:"version"`
	Commit  string `json:"commit,omitempty"`
	Date    string `json:"date,omitempty"`
}

// Get returns a snapshot of the current build metadata.
func Get() Info {
	return Info{Version: Version, Commit: Commit, Date: Date}
}
