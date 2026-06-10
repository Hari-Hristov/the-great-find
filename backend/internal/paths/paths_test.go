package paths

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDataDir_OverrideHonored(t *testing.T) {
	tmp := t.TempDir()
	override := filepath.Join(tmp, "custom-data")

	t.Setenv(envDataDirOverride, override)

	got, err := DataDir()
	if err != nil {
		t.Fatalf("DataDir() returned error: %v", err)
	}
	if got != override {
		t.Fatalf("DataDir() = %q, want %q", got, override)
	}
	if _, err := os.Stat(override); err != nil {
		t.Fatalf("override dir was not created: %v", err)
	}
}

func TestDataDir_FallbackCreatesAppSubdir(t *testing.T) {
	// Unset override so the OS-conventional path is exercised.
	t.Setenv(envDataDirOverride, "")

	dir, err := DataDir()
	if err != nil {
		t.Fatalf("DataDir() returned error: %v", err)
	}
	if !strings.HasSuffix(dir, appDirName) {
		t.Fatalf("DataDir() = %q, expected suffix %q", dir, appDirName)
	}
	if _, err := os.Stat(dir); err != nil {
		t.Fatalf("data dir was not created: %v", err)
	}
}

func TestPathHelpers_AllUnderDataDir(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv(envDataDirOverride, tmp)

	cases := []struct {
		name string
		fn   func() (string, error)
		want string
	}{
		{"DBPath", DBPath, dbFileName},
		{"ConfigPath", ConfigPath, configFileName},
		{"LockPath", LockPath, lockFileName},
		{"ParserCachePath", ParserCachePath, parserCacheFN},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.fn()
			if err != nil {
				t.Fatalf("%s() error: %v", tc.name, err)
			}
			want := filepath.Join(tmp, tc.want)
			if got != want {
				t.Fatalf("%s() = %q, want %q", tc.name, got, want)
			}
		})
	}
}
