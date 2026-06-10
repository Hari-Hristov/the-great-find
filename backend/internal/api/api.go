// Package api wires huma v2 typed handlers under /api/ for the dashboard.
//
// The package is mounted onto the top-level http.ServeMux in cmd/the-great-find/main.go:
//
//	mux.Handle("/api/", http.StripPrefix("/api", api.New(...)))
//	mux.Handle("/events", api.NewSSE(bus))
//
// Handlers depend on a narrow Queries interface that store.Store satisfies — same
// pattern as scheduler.Queries. This keeps the api package testable with fakes and
// lets us swap the DB layer for sqlc-generated code later without touching handlers.
//
// All money values returned by the API include both the raw (price_amount, price_currency)
// pair AND a precomputed price_eur. Frontend sorts/charts on price_eur; raw is for display.
package api

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"

	"github.com/Hari-Hristov/the-great-find/backend/internal/scheduler"
)

// Queries is the read+write surface the API package needs. store.Store implements it.
type Queries interface {
	scheduler.Queries

	GetSavedSearch(ctx context.Context, id int64) (*SavedSearchRow, error)
	ListAllSavedSearches(ctx context.Context) ([]SavedSearchRow, error)
	CreateSavedSearch(ctx context.Context, in CreateSavedSearchInput) (SavedSearchRow, error)
	UpdateSavedSearch(ctx context.Context, in UpdateSavedSearchInput) (SavedSearchRow, error)
	DeleteSavedSearch(ctx context.Context, id int64) error

	ListListings(ctx context.Context, f ListingFilter) ([]ListingRow, error)
	CountListings(ctx context.Context, f ListingFilter) (int, error)
	GetListing(ctx context.Context, id int64) (*ListingRow, error)
	ListListingPhotos(ctx context.Context, listingID int64) ([]Photo, error)
	ListListingParams(ctx context.Context, listingID int64) ([]Param, error)
	ListPriceHistory(ctx context.Context, listingID int64, limit int) ([]PriceObservationRow, error)

	ListRecentAlerts(ctx context.Context, limit int) ([]AlertRow, error)

	AnalyticsForSearch(ctx context.Context, f AnalyticsFilter) (AnalyticsRow, error)
}

// Reloader is what handlers call to talk to the running scheduler:
// Reload picks up saved-search mutations without a restart, and the
// PollSearchByID/PollAll pair drives the manual-refresh endpoints.
// *scheduler.Scheduler satisfies all three.
type Reloader interface {
	Reload(ctx context.Context) error
	PollSearchByID(ctx context.Context, id int64) error
	PollAll(ctx context.Context) int
}

// New mounts handlers onto a chi router and returns the resulting http.Handler.
// The caller is expected to mount this at /api/ on a parent ServeMux.
func New(q Queries, sched Reloader) http.Handler {
	r := chi.NewRouter()
	cfg := huma.DefaultConfig("the-great-find", "0.1.0")
	cfg.Info.Description = "Local-only API for the the-great-find dashboard. Bound to 127.0.0.1; no auth (OS user is the security boundary)."
	api := humachi.New(r, cfg)

	registerSearches(api, q, sched)
	registerListings(api, q)
	registerAlerts(api, q)
	registerAnalytics(api, q)

	return r
}

// nowUTC is a tiny indirection so tests can pin time.
var nowUTC = func() time.Time { return time.Now().UTC() }
