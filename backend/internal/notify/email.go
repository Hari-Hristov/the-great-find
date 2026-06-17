package notify

import (
	"fmt"
	"net/smtp"
	"strings"
)

func sendEmail(cfg SMTPConfig, subject, body string) error {
	if cfg.Host == "" {
		return nil
	}

	auth := smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)

	msg := buildMessage(cfg.FromAddr, cfg.ToAddr, subject, body)
	return smtp.SendMail(addr, auth, cfg.FromAddr, []string{cfg.ToAddr}, []byte(msg))
}

func buildMessage(from, to, subject, body string) string {
	var b strings.Builder
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	fmt.Fprintf(&b, "From: %s\r\n", from)
	fmt.Fprintf(&b, "To: %s\r\n", to)
	fmt.Fprintf(&b, "Subject: %s\r\n", subject)
	b.WriteString("\r\n")
	b.WriteString(body)
	return b.String()
}

func alertEmailBody(title, url, kind string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#111;color:#eee;padding:24px">
  <h2 style="color:#60a5fa">the great find — alert</h2>
  <p><strong>%s</strong></p>
  <p style="color:#aaa">Rule: %s</p>
  <a href="%s" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">View listing</a>
</body>
</html>`, title, kind, url)
}
