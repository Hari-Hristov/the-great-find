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

// ConfigLoader is a function that loads the current SMTPConfig on demand.
// When set, the service reloads config before each email send so changes
// made via the settings UI take effect without restarting the app.
type ConfigLoader func() (SMTPConfig, error)

// Service dispatches notifications. Construct with New and run with Run.
type Service struct {
	// smtp is mutated only from the single Run goroutine via currentSMTPConfig;
	// no mutex is needed.
	smtp       SMTPConfig
	loadConfig ConfigLoader
	logger     *slog.Logger
}

// New returns a Service. cfg.Host == "" means email is disabled.
// Use SetConfigLoader to enable dynamic config reload.
func New(cfg SMTPConfig, logger *slog.Logger) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{smtp: cfg, logger: logger}
}

// SetConfigLoader sets a function that the service calls before each email
// send to get the latest SMTP configuration.
func (s *Service) SetConfigLoader(loader ConfigLoader) {
	s.loadConfig = loader
}

func (s *Service) currentSMTPConfig() SMTPConfig {
	if s.loadConfig != nil {
		cfg, err := s.loadConfig()
		if err != nil {
			s.logger.Warn("failed to reload SMTP config, using cached", "err", err)
			return s.smtp
		}
		s.smtp = cfg
	}
	return s.smtp
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

		cfg := s.currentSMTPConfig()
		if cfg.Host != "" {
			body := alertEmailBody(title, url, kind)
			if err := sendEmail(cfg, subject, body); err != nil {
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
