package api

import (
	"context"

	"github.com/danielgtaylor/huma/v2"
)

// ConfigProvider is the read surface the config handler needs from the parser store.
type ConfigProvider interface {
	Categories() map[string]string
}

func registerConfig(api huma.API, cfg ConfigProvider) {
	huma.Register(api, huma.Operation{
		OperationID: "get-config",
		Method:      "GET",
		Path:        "/config",
		Summary:     "Returns parser-derived config for the frontend (e.g. known category slugs)",
	}, func(_ context.Context, _ *struct{}) (*struct{ Body GetConfigResponse }, error) {
		return &struct{ Body GetConfigResponse }{Body: GetConfigResponse{Categories: cfg.Categories()}}, nil
	})
}
