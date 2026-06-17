// Package notify dispatches OS and email notifications when alerts fire.
//
// OS notifications are mandatory — they fire on every alert.fired and poll.failed
// event regardless of user configuration.
//
// Email notifications are optional. If SMTPConfig.Host is empty the email path
// is silently skipped. More event types can be added in the dispatch switch
// without structural changes.
package notify

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/Hari-Hristov/the-great-find/backend/internal/events"
)

// SMTPConfig holds the user-supplied email credentials. Zero value means
// email is not configured.
type SMTPConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	FromAddr string
	ToAddr   string
}

// Service dispatches notifications. Construct with New and run with Run.
type Service struct {
	smtp   SMTPConfig
	logger *slog.Logger
}

// New returns a Service. cfg.Host == "" means email is disabled.
func New(cfg SMTPConfig, logger *slog.Logger) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{smtp: cfg, logger: logger}
}

// Run subscribes to the bus and blocks until ctx is cancelled.
func (s *Service) Run(ctx context.Context, bus *events.Bus) {
	ch, unsub := bus.Subscribe()
	defer unsub()

	for {
		select {
		case <-ctx.Done():
			return
		case e, ok := <-ch:
			if !ok {
				return
			}
			s.dispatch(e)
		}
	}
}

func (s *Service) dispatch(e events.Event) {
	switch e.Type {
	case events.TypeAlertFired:
		title, url, kind := extractAlertFields(e.Payload)
		subject := fmt.Sprintf("Alert: %s", title)

		if err := sendOSNotification(subject, kind); err != nil {
			s.logger.Warn("os notification failed", "err", err)
		}

		if s.smtp.Host != "" {
			body := alertEmailBody(title, url, kind)
			if err := sendEmail(s.smtp, subject, body); err != nil {
				s.logger.Warn("email notification failed", "err", err)
			}
		}

	case events.TypePollFailed:
		name, _ := e.Payload["name"].(string)
		errMsg, _ := e.Payload["err"].(string)

		title := fmt.Sprintf("Poll failed — %s", name)
		if err := sendOSNotification(title, errMsg); err != nil {
			s.logger.Warn("os notification failed", "err", err)
		}

	case events.TypeListingNew, events.TypeListingUpdated, events.TypePollStarted, events.TypePollFinished:
		// not acted on yet — reserved for future notification types
	}
}

func extractAlertFields(payload map[string]any) (title, url, kind string) {
	if v, ok := payload["title"].(string); ok {
		title = v
	}
	if v, ok := payload["url"].(string); ok {
		url = v
	}
	if v, ok := payload["kind"].(string); ok {
		kind = v
	}
	return
}
