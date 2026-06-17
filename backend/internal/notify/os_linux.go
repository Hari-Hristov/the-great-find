//go:build linux

package notify

import (
	"errors"
	"os/exec"
)

func sendOSNotification(title, body string) error {
	path, err := exec.LookPath("notify-send")
	if err != nil {
		// notify-send not installed — not an error we should propagate.
		return nil
	}
	if err := exec.Command(path, title, body).Run(); err != nil {
		// Non-zero exit (e.g. no DISPLAY) is worth logging upstream but not fatal.
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return nil
		}
		return err
	}
	return nil
}
