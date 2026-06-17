package api

import (
	"context"
	"fmt"
	"strconv"

	"github.com/danielgtaylor/huma/v2"

	"github.com/Hari-Hristov/the-great-find/backend/internal/notify"
)

// AppStateStore is the narrow surface the settings handler needs.
type AppStateStore interface {
	GetAppState(ctx context.Context, key string) (string, error)
	SetAppState(ctx context.Context, key, value string) error
}

// NotificationSettingsBody is the JSON shape for GET and PUT.
type NotificationSettingsBody struct {
	Host     string `json:"smtp_host"`
	Port     int    `json:"smtp_port"`
	Username string `json:"smtp_username"`
	// Password is redacted ("••••") on GET when set; send the real value on PUT.
	// Sending the redacted placeholder on PUT is a no-op (password unchanged).
	Password string `json:"smtp_password"`
	FromAddr string `json:"from_addr"`
	ToAddr   string `json:"to_addr"`
}

func registerNotificationSettings(api huma.API, store AppStateStore) {
	huma.Register(api, huma.Operation{
		OperationID: "get-notification-settings",
		Method:      "GET",
		Path:        "/settings/notifications",
		Summary:     "Returns current SMTP notification configuration (password redacted if set)",
	}, func(ctx context.Context, _ *struct{}) (*struct{ Body NotificationSettingsBody }, error) {
		cfg, err := loadSMTPConfig(ctx, store)
		if err != nil {
			return nil, huma.Error500InternalServerError("load config", err)
		}
		out := NotificationSettingsBody{
			Host:     cfg.Host,
			Port:     cfg.Port,
			Username: cfg.Username,
			FromAddr: cfg.FromAddr,
			ToAddr:   cfg.ToAddr,
		}
		if cfg.Password != "" {
			out.Password = "••••"
		}
		return &struct{ Body NotificationSettingsBody }{Body: out}, nil
	})

	type putInput struct {
		Body NotificationSettingsBody
	}
	huma.Register(api, huma.Operation{
		OperationID: "put-notification-settings",
		Method:      "PUT",
		Path:        "/settings/notifications",
		Summary:     "Saves SMTP notification configuration (password encrypted at rest)",
	}, func(ctx context.Context, in *putInput) (*struct{}, error) {
		b := in.Body

		// If the client sends the redacted placeholder, preserve the existing password.
		if b.Password == "••••" {
			existing, err := store.GetAppState(ctx, "smtp_password_enc")
			if err != nil {
				return nil, huma.Error500InternalServerError("load existing password", err)
			}
			// Put back the already-encrypted value directly — skip re-encrypting.
			if err := store.SetAppState(ctx, "smtp_password_enc", existing); err != nil {
				return nil, huma.Error500InternalServerError("save password", err)
			}
		} else {
			enc, err := notify.EncryptPassword(b.Password)
			if err != nil {
				return nil, huma.Error500InternalServerError("encrypt password", err)
			}
			if err := store.SetAppState(ctx, "smtp_password_enc", enc); err != nil {
				return nil, huma.Error500InternalServerError("save password", err)
			}
		}

		if err := store.SetAppState(ctx, "smtp_host", b.Host); err != nil {
			return nil, huma.Error500InternalServerError("save host", err)
		}
		port := strconv.Itoa(b.Port)
		if err := store.SetAppState(ctx, "smtp_port", port); err != nil {
			return nil, huma.Error500InternalServerError("save port", err)
		}
		if err := store.SetAppState(ctx, "smtp_username", b.Username); err != nil {
			return nil, huma.Error500InternalServerError("save username", err)
		}
		if err := store.SetAppState(ctx, "smtp_from", b.FromAddr); err != nil {
			return nil, huma.Error500InternalServerError("save from", err)
		}
		if err := store.SetAppState(ctx, "smtp_to", b.ToAddr); err != nil {
			return nil, huma.Error500InternalServerError("save to", err)
		}
		return nil, nil
	})
}

// LoadSMTPConfig reads and decrypts the SMTP configuration from app_state.
// Exported so main.go can call it at startup.
func LoadSMTPConfig(ctx context.Context, store AppStateStore) (notify.SMTPConfig, error) {
	return loadSMTPConfig(ctx, store)
}

func loadSMTPConfig(ctx context.Context, store AppStateStore) (notify.SMTPConfig, error) {
	get := func(key string) (string, error) {
		return store.GetAppState(ctx, key)
	}

	host, err := get("smtp_host")
	if err != nil {
		return notify.SMTPConfig{}, fmt.Errorf("read %s: %w", "smtp_host", err)
	}

	portStr, err := get("smtp_port")
	if err != nil {
		return notify.SMTPConfig{}, fmt.Errorf("read %s: %w", "smtp_port", err)
	}
	port, _ := strconv.Atoi(portStr)
	if port == 0 {
		port = 587
	}

	username, err := get("smtp_username")
	if err != nil {
		return notify.SMTPConfig{}, fmt.Errorf("read %s: %w", "smtp_username", err)
	}

	encPass, err := get("smtp_password_enc")
	if err != nil {
		return notify.SMTPConfig{}, fmt.Errorf("read %s: %w", "smtp_password_enc", err)
	}
	password, err := notify.DecryptPassword(encPass)
	if err != nil {
		// Decryption failure (e.g. machine changed) — treat as unconfigured.
		password = ""
	}

	fromAddr, err := get("smtp_from")
	if err != nil {
		return notify.SMTPConfig{}, fmt.Errorf("read %s: %w", "smtp_from", err)
	}

	toAddr, err := get("smtp_to")
	if err != nil {
		return notify.SMTPConfig{}, fmt.Errorf("read %s: %w", "smtp_to", err)
	}

	return notify.SMTPConfig{
		Host:     host,
		Port:     port,
		Username: username,
		Password: password,
		FromAddr: fromAddr,
		ToAddr:   toAddr,
	}, nil
}
