package version

import "testing"

func TestGet_DefaultsToDev(t *testing.T) {
	t.Parallel()
	// The package-level vars are mutable by -ldflags at build time. In an
	// untouched test build they should be at their declared defaults.
	got := Get()
	if got.Version != "dev" {
		t.Errorf("Version = %q, want %q (no -ldflags injection in tests)", got.Version, "dev")
	}
	if got.Commit != "" {
		t.Errorf("Commit = %q, want empty", got.Commit)
	}
	if got.Date != "" {
		t.Errorf("Date = %q, want empty", got.Date)
	}
}
