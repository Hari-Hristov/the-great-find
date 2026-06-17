//go:build linux

package notify

import (
	"context"
	"errors"
	"os/exec"
)

func sendOSNotification(title, body string) error {
	path, err := exec.LookPath("notify-send")
	if err != nil {
		return nil
	}
	if err := exec.CommandContext(context.Background(), path, title, body).Run(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return nil
		}
		return err
	}
	return nil
}
