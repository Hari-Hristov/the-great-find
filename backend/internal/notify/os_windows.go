//go:build windows

package notify

import (
	"fmt"
	"os/exec"
	"strings"
)

func sendOSNotification(title, body string) error {
	// Use PowerShell's BurntToast-free WinRT toast via the Windows Script Host
	// notification balloon approach — works on all Windows 10/11 without extra deps.
	safeTitle := strings.ReplaceAll(title, `"`, `\"`)
	safeBody := strings.ReplaceAll(body, `"`, `\"`)
	script := fmt.Sprintf(`
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$textNodes = $template.GetElementsByTagName("text")
$textNodes.Item(0).AppendChild($template.CreateTextNode("%s")) | Out-Null
$textNodes.Item(1).AppendChild($template.CreateTextNode("%s")) | Out-Null
$toast = [Windows.UI.Notifications.ToastNotification]::new($template)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("the-great-find").Show($toast)
`, safeTitle, safeBody)
	return exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script).Run()
}
