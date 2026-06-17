//go:build darwin

package notify

import (
	"fmt"
	"os/exec"
	"strings"
)

func sendOSNotification(title, body string) error {
	// Escape single quotes for osascript string literals.
	safeTitle := strings.ReplaceAll(title, "'", "'\\''")
	safeBody := strings.ReplaceAll(body, "'", "'\\''")
	script := fmt.Sprintf(`display notification %q with title %q`, safeBody, safeTitle)
	return exec.Command("osascript", "-e", script).Run()
}
