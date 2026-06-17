//go:build windows

package notify

import (
	"os/exec"
)

func sendOSNotification(title, body string) error {
	// Pass title and body as PowerShell arguments to avoid injection via
	// quotes, $-expansion, or backticks in untrusted text.
	script := `
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$textNodes = $template.GetElementsByTagName("text")
$textNodes.Item(0).AppendChild($template.CreateTextNode($args[0])) | Out-Null
$textNodes.Item(1).AppendChild($template.CreateTextNode($args[1])) | Out-Null
$toast = [Windows.UI.Notifications.ToastNotification]::new($template)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("the-great-find").Show($toast)
`
	return exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script, "-args", title, body).Run()
}
