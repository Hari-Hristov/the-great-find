//go:build darwin

package notify

import (
	"fmt"
	"os/exec"
)

func sendOSNotification(title, body string) error {
	script := fmt.Sprintf(`display notification %q with title %q`, body, title)
	return exec.Command("osascript", "-e", script).Run()
}
