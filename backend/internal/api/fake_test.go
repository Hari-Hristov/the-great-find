package api

import (
	"context"
	"sync"
	"time"

	"github.com/Hari-Hristov/the-great-find/backend/internal/scheduler"
)

// fakeQueries is a thin in-memory Queries used by api package tests.
//
// It satisfies api.Queries (which embeds scheduler.Queries). Behaviour is
// minimal — enough to drive handler tests, not a real DB.
type fakeQueries struct {
	mu sync.Mutex

	searches map[int64]SavedSearchRow
	listings map[int64]ListingRow
	photos   map[int64][]Photo
	params   map[int64][]Param
	history  map[int64][]PriceObservationRow
	alerts   []AlertRow
	nextID   int64
}

func newFakeQueries() *fakeQueries {
	return &fakeQueries{
		searches: map[int64]SavedSearchRow{},
		listings: map[int64]ListingRow{},
		photos:   map[int64][]Photo{},
		params:   map[int64][]Param{},
		history:  map[int64][]PriceObservationRow{},
		nextID:   1,
	}
}

// scheduler.Queries surface — unused by API tests, returns zero values.
func (f *fakeQueries) ListActiveSavedSearches(_ context.Context) ([]scheduler.SavedSearch, error) {
	return nil, nil
}
func (f *fakeQueries) UpdateSavedSearchPolledAt(_ context.Context, _ int64, _ time.Time) error {
	return nil
}
func (f *fakeQueries) GetListingByExternalID(_ context.Context, _, _, _ string) (*scheduler.StoredListing, error) {
	return nil, nil
}
func (f *fakeQueries) UpsertListing(_ context.Context, _ scheduler.UpsertListingInput) (scheduler.StoredListing, error) {
	return scheduler.StoredListing{}, nil
}
func (f *fakeQueries) RecordSearchListing(_ context.Context, _ int64, _ int64) error { return nil }
func (f *fakeQueries) InsertPriceObservation(_ context.Context, _ int64, _ string, _ *float64, _ string) error {
	return nil
}
func (f *fakeQueries) ListObservationsForListing(_ context.Context, _ int64, _ int32) ([]scheduler.PriceObservation, error) {
	return nil, nil
}
func (f *fakeQueries) InsertAlertSent(_ context.Context, _ scheduler.InsertAlertSentInput) error {
	return nil
}

// api.Queries surface.
func (f *fakeQueries) GetSavedSearch(_ context.Context, id int64) (*SavedSearchRow, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	r, ok := f.searches[id]
	if !ok {
		return nil, nil
	}
	return &r, nil
}

func (f *fakeQueries) ListAllSavedSearches(_ context.Context) ([]SavedSearchRow, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]SavedSearchRow, 0, len(f.searches))
	for _, r := range f.searches {
		out = append(out, r)
	}
	return out, nil
}

func (f *fakeQueries) CreateSavedSearch(_ context.Context, in CreateSavedSearchInput) (SavedSearchRow, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	id := f.nextID
	f.nextID++
	r := SavedSearchRow{
		ID: id, Name: in.Name, Platform: in.Platform, Country: in.Country,
		QueryParams: in.QueryParams, AlertCriteria: in.AlertCriteria,
		PollIntervalMin: in.PollIntervalMin, Active: in.Active,
		CreatedAt: time.Now().UTC(),
	}
	f.searches[id] = r
	return r, nil
}

func (f *fakeQueries) UpdateSavedSearch(_ context.Context, in UpdateSavedSearchInput) (SavedSearchRow, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	r, ok := f.searches[in.ID]
	if !ok {
		return SavedSearchRow{}, ErrNotFound
	}
	r.Name = in.Name
	r.QueryParams = in.QueryParams
	r.AlertCriteria = in.AlertCriteria
	r.PollIntervalMin = in.PollIntervalMin
	r.Active = in.Active
	f.searches[in.ID] = r
	return r, nil
}

func (f *fakeQueries) DeleteSavedSearch(_ context.Context, id int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.searches[id]; !ok {
		return ErrNotFound
	}
	delete(f.searches, id)
	return nil
}

func (f *fakeQueries) ListListings(_ context.Context, _ ListingFilter) ([]ListingRow, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]ListingRow, 0, len(f.listings))
	for _, l := range f.listings {
		out = append(out, l)
	}
	return out, nil
}

func (f *fakeQueries) CountListings(_ context.Context, _ ListingFilter) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.listings), nil
}

func (f *fakeQueries) GetListing(_ context.Context, id int64) (*ListingRow, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	l, ok := f.listings[id]
	if !ok {
		return nil, nil
	}
	return &l, nil
}

func (f *fakeQueries) ListListingPhotos(_ context.Context, id int64) ([]Photo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.photos[id], nil
}

func (f *fakeQueries) ListListingParams(_ context.Context, id int64) ([]Param, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.params[id], nil
}

func (f *fakeQueries) ListPriceHistory(_ context.Context, id int64, _ int) ([]PriceObservationRow, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.history[id], nil
}

func (f *fakeQueries) ListRecentAlerts(_ context.Context, _ int) ([]AlertRow, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.alerts, nil
}

func (f *fakeQueries) AnalyticsForSearch(_ context.Context, filt AnalyticsFilter) (AnalyticsRow, error) {
	return AnalyticsRow{SearchID: filt.SearchID, WindowDays: filt.WindowDays, TrendEUR: []TrendPoint{}}, nil
}

// fakeReloader counts Reload calls.
type fakeReloader struct {
	mu    sync.Mutex
	calls int
	err   error
}

func (f *fakeReloader) Reload(_ context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	return f.err
}

func (f *fakeReloader) PollSearchByID(_ context.Context, _ int64) error { return nil }
func (f *fakeReloader) PollAll(_ context.Context) int                    { return 0 }

// Compile-time assertions.
var (
	_ Queries  = (*fakeQueries)(nil)
	_ Reloader = (*fakeReloader)(nil)
)
