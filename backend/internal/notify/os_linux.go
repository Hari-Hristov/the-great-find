//go:build linux

package notify

import (
	"context"
	"fmt"
	"os/exec"
)

var notifySendPath string

func init() {
	notifySendPath, _ = exec.LookPath("notify-send")
}

func osNotifyAvailable() bool { return notifySendPath != "" }

func sendOSNotification(title, body string) error {
	if notifySendPath == "" {
		return nil
	}
	if err := exec.CommandContext(context.Background(), notifySendPath, title, body).Run(); err != nil {
		return fmt.Errorf("notify-send failed: %w", err)
	}
	return nil
}
