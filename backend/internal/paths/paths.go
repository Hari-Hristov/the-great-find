// Package paths centralizes the per-OS resolution of the app's data directory.
//
// The app must store its SQLite DB, config.toml, lock file, and parser-config cache
// in the OS-conventional location:
//
//   - Windows: %APPDATA%\the-great-find\
//   - macOS:   ~/Library/Application Support/the-great-find/
//   - Linux:   $XDG_DATA_HOME/the-great-find/  (or ~/.local/share/the-great-find/)
//
// Resolution rules:
//
//   1. If THE_GREAT_FIND_DATA_DIR is set, use it verbatim. (Dev override / test isolation.)
//   2. Otherwise use os.UserConfigDir on Windows/macOS. The convention there is to put
//      app data under the user-config dir, not the data dir.
//   3. On Linux, prefer $XDG_DATA_HOME, falling back to ~/.local/share.
package paths

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

const (
	appDirName = "the-great-find"

	dbFileName = "the-great-find.db"

	envDataDirOverride = "THE_GREAT_FIND_DATA_DIR"
)

// DataDir returns the absolute path to the app's data directory, creating it if missing.
func DataDir() (string, error) {
	if override := os.Getenv(envDataDirOverride); override != "" {
		if err := os.MkdirAll(override, 0o755); err != nil {
			return "", fmt.Errorf("create data dir override: %w", err)
		}
		return override, nil
	}

	root, err := osDataRoot()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(root, appDirName)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create data dir: %w", err)
	}
	return dir, nil
}

func DBPath() (string, error) { return joinIn(DataDir, dbFileName) }

func joinIn(dirFn func() (string, error), file string) (string, error) {
	dir, err := dirFn()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, file), nil
}

// osDataRoot returns the OS-conventional parent directory under which the app's own
// directory will be created.
func osDataRoot() (string, error) {
	switch runtime.GOOS {
	case "windows", "darwin":
		// On Windows: %APPDATA% (Roaming). On macOS: ~/Library/Application Support.
		dir, err := os.UserConfigDir()
		if err != nil {
			return "", fmt.Errorf("user config dir: %w", err)
		}
		return dir, nil
	default:
		// Linux + everything else: XDG_DATA_HOME with the standard fallback.
		if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
			return xdg, nil
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("user home dir: %w", err)
		}
		return filepath.Join(home, ".local", "share"), nil
	}
}
