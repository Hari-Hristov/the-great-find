// Package scheduler runs one polling loop per active saved_searches row.
//
// On Start, the scheduler:
//
//   1. Loads every active row from saved_searches.
//   2. Spawns one searchRunner goroutine per row.
//   3. Each runner sleeps for poll_interval_min, fires a poll cycle, repeats.
//
// A poll cycle:
//
//   - Builds the search URL by combining parser.Config.Search.Path with the
//     saved-search's query_params.
//   - Fetches the grid via the polite scraper.Client (host gate handles spacing).
//   - For each listing: looks it up by external_id, upserts the row, appends a
//     price_observation, then runs the saved search's alert rules.
//   - Updates last_polled_at on success.
//
// Failures during a cycle are logged but never crash the runner: the next tick
// will retry. Stop cancels every runner via context.
package scheduler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/Hari-Hristov/the-great-find/backend/internal/alerts"
	"github.com/Hari-Hristov/the-great-find/backend/internal/events"
	"github.com/Hari-Hristov/the-great-find/backend/internal/parser"
	"github.com/Hari-Hristov/the-great-find/backend/internal/scraper"
)

// SavedSearch is the slice of saved_searches columns the scheduler cares about.
// The DB layer maps its row type onto this — keeps the scheduler decoupled
// from the sqlc generated types so the package can be tested with fakes.
type SavedSearch struct {
	ID                 int64
	Name               string
	QueryParams        []byte // raw JSON from saved_searches.query_params
	AlertCriteria      []byte // raw JSON from saved_searches.alert_criteria (may be nil)
	PollIntervalMin    int
	MaxListingAgeDays  int    // 0 means use DefaultMaxListingAge
}

// StoredListing is the slice of the listings row the scheduler reads back.
type StoredListing struct {
	ID            int64
	PriceAmount   *float64
	PriceCurrency string
	Status        string
}

// PriceObservation is what the scheduler writes per listing per poll, and
// reads back as price-drop history for the alert engine.
type PriceObservation struct {
	Amount   *float64
	Currency string
}

// Queries is the narrow contract the scheduler needs from the DB layer.
// Implemented by an adapter over sqlc-generated code in cmd/.
type Queries interface {
	ListActiveSavedSearches(ctx context.Context) ([]SavedSearch, error)
	UpdateSavedSearchPolledAt(ctx context.Context, id int64, ts time.Time) error

	GetListingByExternalID(ctx context.Context, platform, country, externalID string) (*StoredListing, error)
	UpsertListing(ctx context.Context, in UpsertListingInput) (StoredListing, error)
	RecordSearchListing(ctx context.Context, searchID, listingID int64) error
	InsertPriceObservation(ctx context.Context, listingID int64, eventType string, amount *float64, currency string) error
	ListObservationsForListing(ctx context.Context, listingID int64, limit int32) ([]PriceObservation, error)

	InsertAlertSent(ctx context.Context, in InsertAlertSentInput) error

	MarkStaleListingsRemoved(ctx context.Context, staleDays int) (int64, error)
	MarkUnseenListingsRemoved(ctx context.Context, searchID int64, seenExternalIDs []string) (int64, error)
}

// UpsertListingInput is the scheduler's view of what an upsert requires. The
// adapter translates it to the sqlc UpsertListingParams shape.
type UpsertListingInput struct {
	Platform        string
	Country         string
	ExternalID      string
	URL             string
	Title           string
	PriceAmount     *float64
	PriceCurrency   string
	PriceNegotiable bool
	LocationCity    string
	LocationRegion  string
	PostedAt        *time.Time
	PrimaryImageURL string
	PromotedTop     bool
}

// InsertAlertSentInput is the small projection of alerts_sent the scheduler writes.
type InsertAlertSentInput struct {
	SearchID     int64
	ListingID    int64
	CriteriaHash string
	CriteriaJSON string
}

// Fetcher is the narrow contract the scheduler needs from an ingestion path.
//
// Two implementations live in the tree:
//   - scraper.Client — HTML grid scrape (legacy, fallback when API is disabled).
//   - apiclient.Client — JSON ingestion against /api/v1/offers/ (default when
//     parser config has an `api` block).
//
// Choice happens once at boot in main.go; hot-reload of the parser config does
// NOT swap fetchers mid-run. Switching paths requires a restart — adding/removing
// the `api` block in a remote config still hot-reloads the rest of the config.
type Fetcher interface {
	FetchListingsForSearch(ctx context.Context, queryParamsJSON []byte) ([]scraper.Listing, error)
}

// Scheduler coordinates one runner per active saved search.
//
// Reload re-syncs runners against the DB — call after an admin API mutation
// (Phase 5) so adding/removing/pausing a search takes effect without a restart.
type Scheduler struct {
	queries Queries
	fetcher Fetcher
	cfg     *parser.Store
	bus     *events.Bus
	logger  *slog.Logger

	// maxListingAge is the recency cutoff applied at scrape time. Listings whose
	// parsed posted_at is older than this are dropped before upsert. Listings
	// whose posted_at can't be parsed are kept (parser bugs shouldn't nuke real
	// data). Zero disables the filter (used by tests that don't set it).
	maxListingAge time.Duration
	// now lets tests pin "now" without touching the global clock. Defaults to time.Now.
	now func() time.Time

	mu      sync.Mutex
	runners map[int64]*runner

	wg sync.WaitGroup
	// rootCtx is held on the struct so PollSearchByID/PollAll can detach polls
	// from the request ctx without re-deriving from the parent — a poll must
	// outlive the HTTP handler that triggered it.
	rootCtx context.Context
	cancel  context.CancelFunc
}

// DefaultMaxListingAge is the production recency cutoff — drop anything older.
const DefaultMaxListingAge = 90 * 24 * time.Hour

// DefaultStaleListingDays is how many days without a scrape before a listing
// is considered gone from OLX and marked removed.
const DefaultStaleListingDays = 7

// New builds a scheduler. fetcher may be nil in tests that exercise runner
// lifecycle without polling — Reload still works, but any actual poll would panic.
func New(q Queries, fetcher Fetcher, cfg *parser.Store, bus *events.Bus, logger *slog.Logger) *Scheduler {
	if logger == nil {
		logger = slog.Default()
	}
	return &Scheduler{
		queries:       q,
		fetcher:       fetcher,
		cfg:           cfg,
		bus:           bus,
		logger:        logger,
		maxListingAge: DefaultMaxListingAge,
		now:           time.Now,
		runners:       map[int64]*runner{},
	}
}

// Start initializes runners for every currently active saved search. Returns
// once startup is done — runners continue in the background until Stop or
// the parent context is cancelled.
func (s *Scheduler) Start(ctx context.Context) error {
	s.mu.Lock()
	if s.cancel != nil {
		s.mu.Unlock()
		return fmt.Errorf("scheduler: already started")
	}
	s.rootCtx, s.cancel = context.WithCancel(ctx)
	s.mu.Unlock()

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.staleSweepLoop(s.rootCtx)
	}()

	return s.Reload(s.rootCtx)
}

// Reload diffs the runner set against ListActiveSavedSearches and adjusts:
//   - Adds runners for newly-active searches.
//   - Stops runners for searches that disappeared or went inactive.
//   - Restarts runners whose poll_interval_min changed.
func (s *Scheduler) Reload(ctx context.Context) error {
	rows, err := s.queries.ListActiveSavedSearches(ctx)
	if err != nil {
		return fmt.Errorf("scheduler: list active searches: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	wanted := map[int64]SavedSearch{}
	for _, r := range rows {
		wanted[r.ID] = r
	}

	for id, r := range s.runners {
		next, stillWanted := wanted[id]
		if !stillWanted || next.PollIntervalMin != r.search.PollIntervalMin {
			r.cancel()
			delete(s.runners, id)
		}
	}

	for id, ss := range wanted {
		if _, exists := s.runners[id]; exists {
			continue
		}
		runCtx, cancel := context.WithCancel(s.rootCtx)
		r := &runner{
			search: ss,
			cancel: cancel,
			parent: s,
		}
		s.runners[id] = r
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			r.loop(runCtx)
		}()
	}
	return nil
}

// Stop cancels every runner and waits for them to exit.
func (s *Scheduler) Stop() {
	s.mu.Lock()
	if s.cancel == nil {
		s.mu.Unlock()
		return
	}
	cancel := s.cancel
	s.cancel = nil
	s.mu.Unlock()
	cancel()
	s.wg.Wait()
}

// PollSearchByID fires an immediate poll for the runner managing search id.
// Returns ErrSearchNotRunning when no runner exists for the id (search is
// inactive, paused, or never loaded). The poll runs in a detached goroutine —
// safe alongside the runner's own ticker per the concurrency model: poll() is
// lock-free, DB writers serialize at the connection layer, alert dedup is a
// UNIQUE constraint.
func (s *Scheduler) PollSearchByID(ctx context.Context, id int64) error {
	s.mu.Lock()
	r, ok := s.runners[id]
	rootCtx := s.rootCtx
	s.mu.Unlock()
	if !ok {
		return ErrSearchNotRunning
	}
	go func() {
		// Use the scheduler's root ctx, not the request ctx — a poll can outlive
		// the HTTP handler that triggered it. The request ctx is used only for
		// the lookup above.
		if err := r.poll(rootCtx); err != nil && rootCtx.Err() == nil {
			s.logger.Error("manual poll failed",
				"search_id", r.search.ID, "name", r.search.Name, "err", err)
		}
	}()
	return nil
}

// PollAll fires an immediate poll for every active runner. Returns the count
// of polls fired. Same fire-and-forget semantics as PollSearchByID.
func (s *Scheduler) PollAll(ctx context.Context) int {
	s.mu.Lock()
	runners := make([]*runner, 0, len(s.runners))
	for _, r := range s.runners {
		runners = append(runners, r)
	}
	rootCtx := s.rootCtx
	s.mu.Unlock()

	for _, r := range runners {
		go func() {
			if err := r.poll(rootCtx); err != nil && rootCtx.Err() == nil {
				s.logger.Error("manual poll failed",
					"search_id", r.search.ID, "name", r.search.Name, "err", err)
			}
		}()
	}
	return len(runners)
}

// staleSweepLoop runs once on startup (after a short delay to let the DB
// settle) and then every 24 h. It marks active listings that haven't been
// seen in DefaultStaleListingDays days as removed and publishes a
// listing.removed event so the frontend can refetch.
func (s *Scheduler) staleSweepLoop(ctx context.Context) {
	select {
	case <-ctx.Done():
		return
	case <-time.After(30 * time.Second):
	}

	s.runStaleSweep(ctx)

	t := time.NewTicker(24 * time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.runStaleSweep(ctx)
		}
	}
}

func (s *Scheduler) runStaleSweep(ctx context.Context) {
	n, err := s.queries.MarkStaleListingsRemoved(ctx, DefaultStaleListingDays)
	if err != nil {
		if ctx.Err() == nil {
			s.logger.Error("stale listing sweep failed", "err", err)
		}
		return
	}
	if n > 0 {
		s.logger.Info("stale listings marked removed", "count", n)
		s.bus.Publish(events.Event{
			Type:    events.TypeListingRemoved,
			Payload: map[string]any{"count": n},
		})
	}
}

// ErrSearchNotRunning is returned by PollSearchByID when no runner exists for
// the requested id (e.g. the search is inactive). Handlers translate it to
// 404 at the API edge.
var ErrSearchNotRunning = errors.New("scheduler: search not running")

type runner struct {
	search SavedSearch
	cancel context.CancelFunc
	parent *Scheduler
}

func (r *runner) loop(ctx context.Context) {
	interval := time.Duration(r.search.PollIntervalMin) * time.Minute
	if interval <= 0 {
		interval = 30 * time.Minute
	}

	// Run an immediate poll on start (catch-up); then on the ticker.
	if err := r.poll(ctx); err != nil && ctx.Err() == nil {
		r.parent.logger.Error("poll failed",
			"search_id", r.search.ID, "name", r.search.Name, "err", err)
	}

	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := r.poll(ctx); err != nil && ctx.Err() == nil {
				r.parent.logger.Error("poll failed",
					"search_id", r.search.ID, "name", r.search.Name, "err", err)
			}
		}
	}
}

func (r *runner) failPoll(err error) {
	r.parent.bus.Publish(events.Event{
		Type:    events.TypePollFailed,
		Payload: map[string]any{"search_id": r.search.ID, "err": err.Error()},
	})
}

func (r *runner) publishListingEvent(t events.Type, payload map[string]any) {
	r.parent.bus.Publish(events.Event{Type: t, Payload: payload})
}

func (r *runner) poll(ctx context.Context) error {
	r.parent.bus.Publish(events.Event{
		Type: events.TypePollStarted,
		Payload: map[string]any{"search_id": r.search.ID, "name": r.search.Name},
	})

	cfg := r.parent.cfg.Get()

	r.parent.logger.Info("polling",
		"search_id", r.search.ID, "name", r.search.Name)

	if r.parent.fetcher == nil {
		// Tests that exercise runner lifecycle without polling pass a nil
		// fetcher — drop the cycle as a soft poll-failure rather than panic.
		err := errors.New("scheduler: no fetcher configured")
		r.failPoll(err)
		return err
	}

	listings, err := r.fetchAllVariants(ctx)
	if err != nil {
		r.failPoll(err)
		return fmt.Errorf("fetch listings: %w", err)
	}

	spec, err := alerts.Decode(r.search.AlertCriteria)
	if err != nil {
		// Bad alert criteria shouldn't kill the poll — just log and proceed without alerts.
		r.parent.logger.Warn("invalid alert_criteria, skipping rules",
			"search_id", r.search.ID, "err", err)
		spec = alerts.Spec{}
	}

	pf := parsePriceFilter(r.search.QueryParams)

	for _, l := range listings {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := r.processListing(ctx, l, cfg, spec, pf); err != nil {
			r.parent.logger.Warn("listing process failed",
				"search_id", r.search.ID, "external_id", l.ExternalID, "err", err)
		}
	}

	// Mark active listings that didn't appear in this cycle as removed.
	// Skip when the scraper returned nothing — an empty result set most likely
	// means a transient fetch failure, not that every listing vanished at once.
	if len(listings) > 0 {
		seenIDs := make([]string, len(listings))
		for i, l := range listings {
			seenIDs[i] = l.ExternalID
		}
		if n, err := r.parent.queries.MarkUnseenListingsRemoved(ctx, r.search.ID, seenIDs); err != nil {
			if ctx.Err() == nil {
				r.parent.logger.Warn("mark unseen listings removed failed",
					"search_id", r.search.ID, "err", err)
			}
		} else if n > 0 {
			r.parent.logger.Info("listings marked removed (not seen in poll)",
				"search_id", r.search.ID, "count", n)
			r.parent.bus.Publish(events.Event{
				Type:    events.TypeListingRemoved,
				Payload: map[string]any{"search_id": r.search.ID, "count": n},
			})
		}
	}

	if err := r.parent.queries.UpdateSavedSearchPolledAt(ctx, r.search.ID, time.Now().UTC()); err != nil {
		return fmt.Errorf("mark polled: %w", err)
	}

	r.parent.bus.Publish(events.Event{
		Type:    events.TypePollFinished,
		Payload: map[string]any{"search_id": r.search.ID, "listing_count": len(listings)},
	})
	return nil
}

func (r *runner) processListing(ctx context.Context, l scraper.Listing, cfg *parser.Config, spec alerts.Spec, pf priceFilter) error {
	q := r.parent.queries

	// Recency filter — drop listings older than maxListingAge before we touch the DB.
	// Listings whose PostedAtRaw can't be parsed are kept (parser misses shouldn't
	// silently nuke real listings); only a successfully-parsed-and-too-old one is dropped.
	maxAge := r.parent.maxListingAge
	if r.search.MaxListingAgeDays > 0 {
		maxAge = time.Duration(r.search.MaxListingAgeDays) * 24 * time.Hour
	}
	var postedAt *time.Time
	if t, ok := parsePostedAt(l.PostedAtRaw, r.parent.now()); ok {
		postedAt = &t
		if maxAge > 0 && r.parent.now().Sub(t) > maxAge {
			r.parent.logger.Debug("listing dropped: older than recency cutoff",
				"search_id", r.search.ID, "external_id", l.ExternalID,
				"posted_at", t, "age", r.parent.now().Sub(t))
			return nil
		}
	}

	existing, err := q.GetListingByExternalID(ctx, cfg.Platform, cfg.Country, l.ExternalID)
	if err != nil {
		return fmt.Errorf("lookup existing: %w", err)
	}

	// Skip hidden listings entirely — no upsert, no alert evaluation.
	// The user deliberately flagged this listing; the scheduler should not touch it.
	if existing != nil && existing.Status == "hidden" {
		return nil
	}

	isNew := existing == nil

	// Snapshot the pre-upsert price so the price-change check below compares
	// old vs new rather than new vs new (UpsertListing updates the row in place).
	var oldAmount *float64
	var oldCurrency string
	if existing != nil {
		oldAmount = existing.PriceAmount
		oldCurrency = existing.PriceCurrency
	}

	stored, err := q.UpsertListing(ctx, UpsertListingInput{
		Platform:        cfg.Platform,
		Country:         cfg.Country,
		ExternalID:      l.ExternalID,
		URL:             l.URL,
		Title:           l.Title,
		PriceAmount:     l.PriceAmount,
		PriceCurrency:   l.PriceCurrency,
		PriceNegotiable: l.PriceNegotiable,
		LocationCity:    l.LocationCity,
		LocationRegion:  l.LocationRegion,
		PostedAt:        postedAt,
		PrimaryImageURL: l.PrimaryImageURL,
		PromotedTop:     l.PromotedTop,
	})
	if err != nil {
		return fmt.Errorf("upsert: %w", err)
	}

	if err := q.RecordSearchListing(ctx, r.search.ID, stored.ID); err != nil {
		return fmt.Errorf("record search listing: %w", err)
	}

	priceChanged := isNew || priceAmountChanged(oldAmount, l.PriceAmount) || oldCurrency != l.PriceCurrency
	if priceChanged {
		eventType := "updated"
		if isNew {
			eventType = "created"
		}
		if err := q.InsertPriceObservation(ctx, stored.ID, eventType, l.PriceAmount, l.PriceCurrency); err != nil {
			return fmt.Errorf("price observation: %w", err)
		}
	}

	if isNew {
		r.publishListingEvent(events.TypeListingNew, map[string]any{
			"id": stored.ID, "search_id": r.search.ID, "title": l.Title, "url": l.URL,
		})
	} else {
		r.publishListingEvent(events.TypeListingUpdated, map[string]any{
			"id": stored.ID, "search_id": r.search.ID,
		})
	}

	history, err := q.ListObservationsForListing(ctx, stored.ID, 10)
	if err != nil {
		return fmt.Errorf("history: %w", err)
	}
	priceHistory := make([]alerts.PriceHistory, 0, len(history))
	for _, h := range history {
		priceHistory = append(priceHistory, alerts.PriceHistory{Amount: h.Amount, Currency: h.Currency})
	}

	matches := spec.Evaluate(alerts.Listing{
		ID:            stored.ID,
		Title:         l.Title,
		Description:   l.Description,
		PriceAmount:   l.PriceAmount,
		PriceCurrency: l.PriceCurrency,
		IsNew:         isNew,
	}, priceHistory)
	if !pf.contains(l.PriceAmount, l.PriceCurrency) {
		matches = nil
	}

	for _, m := range matches {
		if err := q.InsertAlertSent(ctx, InsertAlertSentInput{
			SearchID:     r.search.ID,
			ListingID:    stored.ID,
			CriteriaHash: m.CriteriaHash,
			CriteriaJSON: m.CriteriaJSON,
		}); err != nil {
			r.parent.logger.Warn("insert alert failed", "err", err)
			continue
		}
		r.parent.bus.Publish(events.Event{
			Type: events.TypeAlertFired,
			Payload: map[string]any{
				"search_id":  r.search.ID,
				"listing_id": stored.ID,
				"kind":       m.Kind,
				"details":    m.Details,
				"title":      l.Title,
				"url":        l.URL,
			},
		})
	}
	return nil
}

// fetchAllVariants expands the saved search's keyword over the built-in
// transliteration map plus any user-supplied keyword_variants, fires one
// fetch per variant, and returns the deduped listings. A single fetch
// failure aborts the cycle — partial results would silently shrink the
// catch-up batch.
func (r *runner) fetchAllVariants(ctx context.Context) ([]scraper.Listing, error) {
	queries, err := expandQueryParams(r.search.QueryParams)
	if err != nil {
		return nil, err
	}

	var combined []scraper.Listing
	for _, q := range queries {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		got, err := r.parent.fetcher.FetchListingsForSearch(ctx, q)
		if err != nil {
			return nil, err
		}
		combined = append(combined, got...)
	}
	return dedupeListingsByExternalID(combined), nil
}

// priceAmountChanged reports whether the incoming price amount differs from the
// stored one. Both nil means no change; one nil means changed; two non-nil
// values are compared numerically.
func priceAmountChanged(stored, incoming *float64) bool {
	if stored == nil && incoming == nil {
		return false
	}
	if stored == nil || incoming == nil {
		return true
	}
	return *stored != *incoming
}
