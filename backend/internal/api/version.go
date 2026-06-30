package api

import (
	"context"

	"github.com/danielgtaylor/huma/v2"

	"github.com/Hari-Hristov/the-great-find/backend/internal/version"
)

// registerVersion exposes GET /version so the dashboard can show a build
// stamp (version + short commit) somewhere quiet — handy for support
// triage. No request body; returns the values injected via -ldflags at
// build time.
func registerVersion(api huma.API) {
	huma.Register(api, huma.Operation{
		OperationID: "get-version",
		Method:      "GET",
		Path:        "/version",
		Summary:     "Build metadata (version, commit, build date)",
	}, func(_ context.Context, _ *struct{}) (*struct{ Body version.Info }, error) {
		return &struct{ Body version.Info }{Body: version.Get()}, nil
	})
}
