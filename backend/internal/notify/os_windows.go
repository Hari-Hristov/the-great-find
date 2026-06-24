//go:build windows

package notify

import (
	"os"
	"os/exec"
)

func osNotifyAvailable() bool { return true }

func sendOSNotification(title, body, url string) error {
	actionsBlock := ""
	launchAttr := ""
	if url != "" {
		launchAttr = ` launch="` + xmlEscape(url) + `"`
		actionsBlock = `<actions><action content="View Listing" activationType="protocol" arguments="` + xmlEscape(url) + `"/></actions>`
	}
	xml := `<toast` + launchAttr + `><visual><binding template="ToastGeneric"><text>` +
		xmlEscape(title) + `</text><text>` + xmlEscape(body) + `</text></binding></visual>` + actionsBlock + `</toast>`

	script := `
$xml = $env:TOAST_XML
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime]
$doc = [Windows.Data.Xml.Dom.XmlDocument]::new()
$doc.LoadXml($xml)
$toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("the-great-find").Show($toast)
`
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	cmd.Env = append(os.Environ(), "TOAST_XML="+xml)
	return cmd.Run()
}
