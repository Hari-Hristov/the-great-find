package api

import (
	"context"

	"github.com/danielgtaylor/huma/v2"

	"github.com/Hari-Hristov/the-great-find/backend/internal/version"
)

// versionInput exposes ?verbose=1 to opt-in to the full build stamp. The
// default response is version-only so the endpoint doesn't hand a build
// timestamp + short SHA to any caller that manages to reach it. The full
// metadata is still available for the in-app About dialog and for support
// triage — it's just not the default.
type versionInput struct {
	Verbose bool `query:"verbose" doc:"Include commit SHA and build date. Default is version-only."`
}

// registerVersion exposes GET /version so the dashboard can show a build
// stamp somewhere quiet — handy for support triage.
func registerVersion(api huma.API) {
	huma.Register(api, huma.Operation{
		OperationID: "get-version",
		Method:      "GET",
		Path:        "/version",
		Summary:     "Build metadata (version, and optionally commit + build date)",
	}, func(_ context.Context, in *versionInput) (*struct{ Body version.Info }, error) {
		info := version.Get()
		if !in.Verbose {
			info.Commit = ""
			info.Date = ""
		}
		return &struct{ Body version.Info }{Body: info}, nil
	})
}
