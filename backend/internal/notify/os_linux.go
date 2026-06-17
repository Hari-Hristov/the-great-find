//go:build linux

package notify

import (
	"context"
	"fmt"
	"os/exec"
)

func sendOSNotification(title, body string) error {
	path, err := exec.LookPath("notify-send")
	if err != nil {
		return fmt.Errorf("notify-send not found: %w", err)
	}
	if err := exec.CommandContext(context.Background(), path, title, body).Run(); err != nil {
		return fmt.Errorf("notify-send failed: %w", err)
	}
	return nil
}
