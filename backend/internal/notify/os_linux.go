//go:build linux

package notify

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

var (
	notifySendPath string
	isWSL          bool
)

func init() {
	if data, err := os.ReadFile("/proc/version"); err == nil {
		isWSL = strings.Contains(strings.ToLower(string(data)), "microsoft")
	}
	if !isWSL {
		notifySendPath, _ = exec.LookPath("notify-send")
	}
}

func osNotifyAvailable() bool { return isWSL || notifySendPath != "" }

func sendOSNotification(title, body, url string) error {
	if isWSL {
		return sendWSLNotification(title, body, url)
	}
	if notifySendPath == "" {
		return nil
	}
	if err := exec.CommandContext(context.Background(), notifySendPath, title, body).Run(); err != nil {
		return fmt.Errorf("notify-send failed: %w", err)
	}
	return nil
}

func sendWSLNotification(title, body, url string) error {
	// powershell.exe is reachable from WSL2 and executes on the Windows host,
	// so toast notifications surface in the Windows Action Center.
	const ps = `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`

	// Use the generic toast XML schema so we can embed a launch URL and an
	// explicit "View Listing" button. Clicking either the body or the button
	// opens the URL via the default browser (activationType="protocol").
	// When url is empty (e.g. poll.failed) the actions block is omitted.
	actionsBlock := ""
	launchAttr := ""
	if url != "" {
		launchAttr = ` launch="` + xmlEscape(url) + `"`
		actionsBlock = `<actions><action content="View Listing" activationType="protocol" arguments="` + xmlEscape(url) + `"/></actions>`
	}
	xml := `<toast` + launchAttr + `><visual><binding template="ToastGeneric"><text>` +
		xmlEscape(title) + `</text><text>` + xmlEscape(body) + `</text></binding></visual>` + actionsBlock + `</toast>`

	// Write the XML and a generated .ps1 script to a Windows-accessible temp
	// directory. We can't pass the XML via -Command (the leading '<' is parsed
	// as redirection) or via env var (WSL env vars don't cross into Win32
	// processes without WSLENV). Reading the XML from a file from inside the
	// script is the only quoting-safe channel.
	dir, err := os.MkdirTemp("/mnt/c/Windows/Temp", "tgf-toast-*")
	if err != nil {
		return fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(dir)

	xmlPath := filepath.Join(dir, "toast.xml")
	if err := os.WriteFile(xmlPath, []byte(xml), 0o600); err != nil {
		return fmt.Errorf("write toast xml: %w", err)
	}

	// Convert the /mnt/c/... path to a Windows path for the PowerShell script.
	winXMLPath, err := wslToWindowsPath(xmlPath)
	if err != nil {
		return fmt.Errorf("convert xml path: %w", err)
	}

	script := `
$xml = [System.IO.File]::ReadAllText('` + winXMLPath + `')
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime]
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$toast = New-Object Windows.UI.Notifications.ToastNotification $doc
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("the-great-find").Show($toast)
`
	var stderr bytes.Buffer
	cmd := exec.Command(ps, "-NoProfile", "-NonInteractive", "-Command", script)
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("windows toast failed: %w — %s", err, stderr.String())
	}
	return nil
}

// wslToWindowsPath turns "/mnt/c/Windows/Temp/foo" into "C:\Windows\Temp\foo"
// using wslpath, which is part of the standard WSL2 distro.
func wslToWindowsPath(p string) (string, error) {
	out, err := exec.Command("wslpath", "-w", p).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}
