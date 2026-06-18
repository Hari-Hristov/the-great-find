package scheduler

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Hari-Hristov/the-great-find/backend/internal/alerts"
	"github.com/Hari-Hristov/the-great-find/backend/internal/events"
	"github.com/Hari-Hristov/the-great-find/backend/internal/parser"
	"github.com/Hari-Hristov/the-great-find/backend/internal/scraper"
)

// fakeQueries records every call and lets tests script return values.
type fakeQueries struct {
	mu sync.Mutex

	activeSearches []SavedSearch
	listErr        error

	// per (platform, country, external_id) → existing listing (nil = new)
	existing map[string]*StoredListing
	// upserts seen
	upserts []UpsertListingInput
	// observations seen
	observations []obsCall
	// alerts seen
	alerts []InsertAlertSentInput
	// price history per listing id, newest-first
	history map[int64][]PriceObservation
	// last polled
	polled map[int64]time.Time

	// signals
	pollSignaled chan struct{}

	// stale sweep tracking
	staleSweepCalls []int
	staleSweepN     int64
	staleSweepErr   error

	// unseen tracking
	unseenCalls []unseenCall
	unseenN     int64
	unseenErr   error
}

type unseenCall struct {
	searchID        int64
	seenExternalIDs []string
}

type obsCall struct {
	listingID int64
	eventType string
	amount    *float64
	currency  string
}

func newFakeQueries() *fakeQueries {
	return &fakeQueries{
		existing:     map[string]*StoredListing{},
		history:      map[int64][]PriceObservation{},
		polled:       map[int64]time.Time{},
		pollSignaled: make(chan struct{}, 16),
	}
}

func (f *fakeQueries) ListActiveSavedSearches(ctx context.Context) ([]SavedSearch, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.listErr != nil {
		return nil, f.listErr
	}
	out := make([]SavedSearch, len(f.activeSearches))
	copy(out, f.activeSearches)
	return out, nil
}

func (f *fakeQueries) UpdateSavedSearchPolledAt(ctx context.Context, id int64, ts time.Time) error {
	f.mu.Lock()
	f.polled[id] = ts
	f.mu.Unlock()
	select {
	case f.pollSignaled <- struct{}{}:
	default:
	}
	return nil
}

func (f *fakeQueries) GetListingByExternalID(ctx context.Context, platform, country, externalID string) (*StoredListing, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.existing[platform+"|"+country+"|"+externalID], nil
}

var nextListingID int64 = 100

func (f *fakeQueries) UpsertListing(ctx context.Context, in UpsertListingInput) (StoredListing, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.upserts = append(f.upserts, in)
	key := in.Platform + "|" + in.Country + "|" + in.ExternalID
	if existing := f.existing[key]; existing != nil {
		// update
		existing.PriceAmount = in.PriceAmount
		existing.PriceCurrency = in.PriceCurrency
		return *existing, nil
	}
	id := atomic.AddInt64(&nextListingID, 1)
	row := &StoredListing{ID: id, PriceAmount: in.PriceAmount, PriceCurrency: in.PriceCurrency}
	f.existing[key] = row
	return *row, nil
}

func (f *fakeQueries) InsertPriceObservation(ctx context.Context, listingID int64, eventType string, amount *float64, currency string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.observations = append(f.observations, obsCall{listingID, eventType, amount, currency})
	// Prepend so history is newest-first.
	f.history[listingID] = append([]PriceObservation{{Amount: amount, Currency: currency}}, f.history[listingID]...)
	return nil
}

func (f *fakeQueries) ListObservationsForListing(ctx context.Context, listingID int64, limit int32) ([]PriceObservation, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	h := f.history[listingID]
	if int(limit) < len(h) {
		h = h[:limit]
	}
	out := make([]PriceObservation, len(h))
	copy(out, h)
	return out, nil
}

func (f *fakeQueries) InsertAlertSent(ctx context.Context, in InsertAlertSentInput) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.alerts = append(f.alerts, in)
	return nil
}

func (f *fakeQueries) RecordSearchListing(_ context.Context, _, _ int64) error { return nil }

func (f *fakeQueries) MarkStaleListingsRemoved(_ context.Context, staleDays int) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.staleSweepCalls = append(f.staleSweepCalls, staleDays)
	return f.staleSweepN, f.staleSweepErr
}

func (f *fakeQueries) MarkUnseenListingsRemoved(_ context.Context, searchID int64, seenIDs []string) (int64, error) {
	if len(seenIDs) == 0 {
		return 0, nil
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.unseenCalls = append(f.unseenCalls, unseenCall{searchID: searchID, seenExternalIDs: seenIDs})
	return f.unseenN, f.unseenErr
}

// testParserStore returns a parser.Store seeded from the embedded olx-bg config.
func testParserStore(t *testing.T) *parser.Store {
	t.Helper()
	cfg, err := parser.EmbeddedOLXBG()
	if err != nil {
		t.Fatalf("load embedded parser config: %v", err)
	}
	return parser.NewStore(cfg)
}

// fakeFetcher is a Fetcher implementation that scripts return values per test.
// Lets runner-lifecycle tests exercise polls without the HTML or JSON paths.
type fakeFetcher struct {
	mu       sync.Mutex
	listings []scraper.Listing
	err      error
	calls    int
}

func (f *fakeFetcher) FetchListingsForSearch(ctx context.Context, queryParamsJSON []byte) ([]scraper.Listing, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	return f.listings, f.err
}

func scraperListingStub(externalID, title, postedAtRaw string) scraper.Listing {
	return scraper.Listing{
		ExternalID:  externalID,
		URL:         "https://olx.bg/item/" + externalID,
		Title:       title,
		PostedAtRaw: postedAtRaw,
	}
}

func defaultSpec() alerts.Spec {
	s, _ := alerts.Decode(nil)
	return s
}

func TestScheduler_StartIsIdempotentlyRejected(t *testing.T) {
	q := newFakeQueries()
	bus := events.NewBus(8)
	defer bus.Close()
	s := New(q, nil, testParserStore(t), bus, nil)

	if err := s.Start(context.Background()); err != nil {
		t.Fatalf("first Start: %v", err)
	}
	defer s.Stop()
	if err := s.Start(context.Background()); err == nil {
		t.Fatal("second Start should refuse")
	}
}

func TestScheduler_ReloadStopsRemovedSearches(t *testing.T) {
	q := newFakeQueries()
	q.activeSearches = []SavedSearch{
		{ID: 1, Name: "a", PollIntervalMin: 60, QueryParams: []byte(`{"keyword":"x"}`)},
		{ID: 2, Name: "b", PollIntervalMin: 60, QueryParams: []byte(`{"keyword":"y"}`)},
	}
	bus := events.NewBus(8)
	defer bus.Close()
	s := New(q, nil, testParserStore(t), bus, nil)

	// scraper is nil so polls will explode — that's fine, we only care about runner lifecycle.
	if err := s.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer s.Stop()

	s.mu.Lock()
	gotN := len(s.runners)
	s.mu.Unlock()
	if gotN != 2 {
		t.Fatalf("got %d runners, want 2", gotN)
	}

	q.mu.Lock()
	q.activeSearches = q.activeSearches[:1] // remove search 2
	q.mu.Unlock()

	if err := s.Reload(context.Background()); err != nil {
		t.Fatalf("Reload: %v", err)
	}

	// give the goroutine a moment to exit
	time.Sleep(50 * time.Millisecond)

	s.mu.Lock()
	gotN = len(s.runners)
	_, hasOne := s.runners[1]
	_, hasTwo := s.runners[2]
	s.mu.Unlock()
	if gotN != 1 || !hasOne || hasTwo {
		t.Fatalf("after reload: %d runners, has1=%v has2=%v", gotN, hasOne, hasTwo)
	}
}

func TestScheduler_StartListErrorPropagates(t *testing.T) {
	q := newFakeQueries()
	q.listErr = errors.New("db down")
	bus := events.NewBus(8)
	defer bus.Close()
	s := New(q, nil, testParserStore(t), bus, nil)

	if err := s.Start(context.Background()); err == nil {
		t.Fatal("expected error from list query")
	}
}

func TestProcessListing_DropsOlderThanCutoff(t *testing.T) {
	q := newFakeQueries()
	bus := events.NewBus(8)
	defer bus.Close()
	cfg, _ := parser.EmbeddedOLXBG()
	ps := parser.NewStore(cfg)

	// Pin "now" — cutoff is 30d.
	now := time.Date(2026, 6, 9, 15, 0, 0, 0, sofiaLoc)
	s := New(q, nil, ps, bus, nil)
	s.now = func() time.Time { return now }
	// Already DefaultMaxListingAge = 90d from constructor, but be explicit:
	s.maxListingAge = 30 * 24 * time.Hour

	r := &runner{
		search: SavedSearch{ID: 1, Name: "test"},
		parent: s,
	}

	// Old listing — "12 дек" with no year and December > June resolves to 2025-12-12,
	// ~6 months ago. Must be dropped (no upsert, no observation).
	old := scraperListingStub("ext-old", "Old listing", "12 дек")
	if err := r.processListing(context.Background(), old, cfg, defaultSpec(), priceFilter{}); err != nil {
		t.Fatalf("processListing(old): %v", err)
	}
	if len(q.upserts) != 0 {
		t.Fatalf("expected old listing to be dropped, got %d upserts", len(q.upserts))
	}
	if len(q.observations) != 0 {
		t.Fatalf("expected no price observation for dropped listing, got %d", len(q.observations))
	}

	// Fresh listing — "Днес 14:32" must go through.
	fresh := scraperListingStub("ext-new", "Fresh listing", "Днес 14:32")
	if err := r.processListing(context.Background(), fresh, cfg, defaultSpec(), priceFilter{}); err != nil {
		t.Fatalf("processListing(fresh): %v", err)
	}
	if len(q.upserts) != 1 {
		t.Fatalf("expected 1 upsert for fresh listing, got %d", len(q.upserts))
	}
	if q.upserts[0].PostedAt == nil {
		t.Fatal("expected PostedAt to be set on upsert")
	}

	// Unparseable timestamp — must be kept (parser bug shouldn't nuke real listings).
	mystery := scraperListingStub("ext-mystery", "Mystery listing", "не знам кога")
	if err := r.processListing(context.Background(), mystery, cfg, defaultSpec(), priceFilter{}); err != nil {
		t.Fatalf("processListing(mystery): %v", err)
	}
	if len(q.upserts) != 2 {
		t.Fatalf("expected 2 upserts after mystery (kept), got %d", len(q.upserts))
	}
	if q.upserts[1].PostedAt != nil {
		t.Fatal("expected PostedAt to be nil for unparseable timestamp")
	}
}

func TestScheduler_PollDispatchesThroughFetcher(t *testing.T) {
	q := newFakeQueries()
	q.activeSearches = []SavedSearch{
		{ID: 1, Name: "watch-laptops", PollIntervalMin: 60, QueryParams: []byte(`{"keyword":"laptop"}`)},
	}
	bus := events.NewBus(8)
	defer bus.Close()

	fetcher := &fakeFetcher{
		listings: []scraper.Listing{scraperListingStub("ext-1", "Laptop", "Днес 10:00")},
	}
	s := New(q, fetcher, testParserStore(t), bus, nil)

	if err := s.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer s.Stop()

	// Wait for the immediate-on-start poll to land via the polled-signal channel.
	select {
	case <-q.pollSignaled:
	case <-time.After(time.Second):
		t.Fatal("scheduler never polled through the fetcher")
	}

	fetcher.mu.Lock()
	calls := fetcher.calls
	fetcher.mu.Unlock()
	if calls < 1 {
		t.Errorf("fetcher.calls = %d, want >= 1", calls)
	}
	if len(q.upserts) != 1 {
		t.Errorf("upserts = %d, want 1", len(q.upserts))
	}
}

func TestScheduler_PollSearchByID_NotFound(t *testing.T) {
	q := newFakeQueries()
	bus := events.NewBus(8)
	defer bus.Close()
	s := New(q, &fakeFetcher{}, testParserStore(t), bus, nil)

	if err := s.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer s.Stop()

	if err := s.PollSearchByID(context.Background(), 999); err == nil {
		t.Fatal("expected error for unknown search id")
	} else if !errors.Is(err, ErrSearchNotRunning) {
		t.Errorf("err = %v, want ErrSearchNotRunning", err)
	}
}

func TestScheduler_PollSearchByID_FiresPoll(t *testing.T) {
	q := newFakeQueries()
	q.activeSearches = []SavedSearch{
		{ID: 7, Name: "manual-poll", PollIntervalMin: 60, QueryParams: []byte(`{"keyword":"laptop"}`)},
	}
	bus := events.NewBus(8)
	defer bus.Close()

	fetcher := &fakeFetcher{
		listings: []scraper.Listing{scraperListingStub("ext-1", "Laptop", "Днес 10:00")},
	}
	s := New(q, fetcher, testParserStore(t), bus, nil)

	if err := s.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer s.Stop()

	// Drain the immediate-on-start poll signal so the assertion measures the manual one.
	select {
	case <-q.pollSignaled:
	case <-time.After(time.Second):
		t.Fatal("startup poll never fired")
	}

	if err := s.PollSearchByID(context.Background(), 7); err != nil {
		t.Fatalf("PollSearchByID: %v", err)
	}

	select {
	case <-q.pollSignaled:
	case <-time.After(time.Second):
		t.Fatal("manual poll never landed")
	}
}

func TestScheduler_PollAll_FiresAllRunners(t *testing.T) {
	q := newFakeQueries()
	q.activeSearches = []SavedSearch{
		{ID: 1, Name: "one", PollIntervalMin: 60, QueryParams: []byte(`{"keyword":"a"}`)},
		{ID: 2, Name: "two", PollIntervalMin: 60, QueryParams: []byte(`{"keyword":"b"}`)},
	}
	bus := events.NewBus(8)
	defer bus.Close()
	fetcher := &fakeFetcher{}
	s := New(q, fetcher, testParserStore(t), bus, nil)

	if err := s.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer s.Stop()

	// Drain the two startup polls.
	for i := 0; i < 2; i++ {
		select {
		case <-q.pollSignaled:
		case <-time.After(time.Second):
			t.Fatalf("startup poll %d never fired", i)
		}
	}

	count := s.PollAll(context.Background())
	if count != 2 {
		t.Errorf("PollAll returned %d, want 2", count)
	}

	for i := 0; i < 2; i++ {
		select {
		case <-q.pollSignaled:
		case <-time.After(time.Second):
			t.Fatalf("manual poll %d never landed", i)
		}
	}
}

func TestRunner_FanOutDedupesByExternalID(t *testing.T) {
	q := newFakeQueries()
	q.activeSearches = []SavedSearch{
		// keyword "nintendo switch" expands to ["nintendo switch", "нинтендо суич"] —
		// 2 fan-out calls, plus 1 user variant = 3 total. The fakeFetcher returns
		// the same listing every time so dedup keeps it to 1 upsert.
		{
			ID: 1, Name: "fan-out", PollIntervalMin: 60,
			QueryParams: []byte(`{"keyword":"nintendo switch","keyword_variants":["konzola"]}`),
		},
	}
	bus := events.NewBus(8)
	defer bus.Close()

	fetcher := &fakeFetcher{
		listings: []scraper.Listing{scraperListingStub("ext-dup", "Nintendo Switch", "Днес 10:00")},
	}
	s := New(q, fetcher, testParserStore(t), bus, nil)

	if err := s.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer s.Stop()

	select {
	case <-q.pollSignaled:
	case <-time.After(time.Second):
		t.Fatal("scheduler never polled")
	}

	fetcher.mu.Lock()
	calls := fetcher.calls
	fetcher.mu.Unlock()
	if calls != 3 {
		t.Errorf("fetcher.calls = %d, want 3 (original + translit + 1 user variant)", calls)
	}
	if len(q.upserts) != 1 {
		t.Errorf("upserts = %d, want 1 (deduped on external_id)", len(q.upserts))
	}
}

func TestProcessListing_PriceFilterSuppressesAlert(t *testing.T) {
	q := newFakeQueries()
	bus := events.NewBus(8)
	defer bus.Close()
	cfg, _ := parser.EmbeddedOLXBG()
	ps := parser.NewStore(cfg)

	s := New(q, nil, ps, bus, nil)
	s.maxListingAge = 0
	r := &runner{search: SavedSearch{ID: 1, Name: "test"}, parent: s}

	spec, _ := alerts.Decode([]byte(`{"kind":"price_below","price_eur":200}`))
	pf := parsePriceFilter([]byte(`{"keyword":"switch","price_min":"50"}`))

	price := func(v float64) *float64 { return &v }

	// Listing priced at €30 — below the price_min of €50.
	// price_below:200 would normally fire (30 <= 200), but pf.contains must suppress it.
	cheap := scraper.Listing{
		ExternalID:    "ext-cheap",
		URL:           "https://olx.bg/item/ext-cheap",
		Title:         "Cheap accessory",
		PriceAmount:   price(30),
		PriceCurrency: "EUR",
	}
	if err := r.processListing(context.Background(), cheap, cfg, spec, pf); err != nil {
		t.Fatalf("processListing(cheap): %v", err)
	}
	if len(q.alerts) != 0 {
		t.Fatalf("alert must not fire for listing below price_min: got %+v", q.alerts)
	}

	// Listing priced at €150 — within [50, ∞) and below price_below:200 → must fire.
	inRange := scraper.Listing{
		ExternalID:    "ext-inrange",
		URL:           "https://olx.bg/item/ext-inrange",
		Title:         "Switch console",
		PriceAmount:   price(150),
		PriceCurrency: "EUR",
	}
	if err := r.processListing(context.Background(), inRange, cfg, spec, pf); err != nil {
		t.Fatalf("processListing(inRange): %v", err)
	}
	if len(q.alerts) != 1 {
		t.Fatalf("alert must fire for listing within price_min: got %d alerts", len(q.alerts))
	}
}

func TestProcessListing_ObservationOnlyOnPriceChange(t *testing.T) {
	q := newFakeQueries()
	bus := events.NewBus(8)
	defer bus.Close()
	cfg, _ := parser.EmbeddedOLXBG()
	ps := parser.NewStore(cfg)

	s := New(q, nil, ps, bus, nil)
	s.maxListingAge = 0 // disable recency filter
	r := &runner{search: SavedSearch{ID: 1, Name: "test"}, parent: s}

	price := func(v float64) *float64 { return &v }

	listing := scraper.Listing{
		ExternalID: "ext-obs",
		URL:        "https://olx.bg/item/ext-obs",
		Title:      "Test item",
		PriceAmount: price(100),
		PriceCurrency: "EUR",
	}

	// First poll — new listing, observation must be written.
	if err := r.processListing(context.Background(), listing, cfg, defaultSpec(), priceFilter{}); err != nil {
		t.Fatalf("first poll: %v", err)
	}
	if len(q.observations) != 1 {
		t.Fatalf("after first poll: want 1 observation, got %d", len(q.observations))
	}
	if q.observations[0].eventType != "created" {
		t.Errorf("first observation event_type = %q, want created", q.observations[0].eventType)
	}

	// Second poll — same price, no observation.
	if err := r.processListing(context.Background(), listing, cfg, defaultSpec(), priceFilter{}); err != nil {
		t.Fatalf("second poll (same price): %v", err)
	}
	if len(q.observations) != 1 {
		t.Fatalf("after second poll (same price): want 1 observation, got %d", len(q.observations))
	}

	// Third poll — price changed, observation must be written.
	listing.PriceAmount = price(90)
	if err := r.processListing(context.Background(), listing, cfg, defaultSpec(), priceFilter{}); err != nil {
		t.Fatalf("third poll (price drop): %v", err)
	}
	if len(q.observations) != 2 {
		t.Fatalf("after third poll (price drop): want 2 observations, got %d", len(q.observations))
	}
	if q.observations[1].eventType != "updated" {
		t.Errorf("second observation event_type = %q, want updated", q.observations[1].eventType)
	}
}

func TestStaleSweepLoop_CallsMarkStaleAndPublishes(t *testing.T) {
	q := newFakeQueries()
	q.staleSweepN = 3

	bus := events.NewBus(8)
	defer bus.Close()
	sub, unsub := bus.Subscribe()
	defer unsub()

	s := New(q, nil, testParserStore(t), bus, nil)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Run a single sweep directly.
	s.runStaleSweep(ctx)

	q.mu.Lock()
	calls := q.staleSweepCalls
	q.mu.Unlock()

	if len(calls) != 1 {
		t.Fatalf("expected 1 stale sweep call, got %d", len(calls))
	}
	if calls[0] != DefaultStaleListingDays {
		t.Errorf("stale sweep called with %d days, want %d", calls[0], DefaultStaleListingDays)
	}

	// Should have published a listing.removed event.
	select {
	case ev := <-sub:
		if ev.Type != events.TypeListingRemoved {
			t.Errorf("event type = %q, want %q", ev.Type, events.TypeListingRemoved)
		}
		count, _ := ev.Payload["count"].(int64)
		if count != 3 {
			t.Errorf("event payload count = %d, want 3", count)
		}
	case <-time.After(time.Second):
		t.Fatal("expected listing.removed event but got none")
	}
}

func TestStaleSweepLoop_NoEventOnZeroUpdates(t *testing.T) {
	q := newFakeQueries()
	q.staleSweepN = 0

	bus := events.NewBus(8)
	defer bus.Close()
	sub, unsub := bus.Subscribe()
	defer unsub()

	s := New(q, nil, testParserStore(t), bus, nil)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	s.runStaleSweep(ctx)

	select {
	case ev := <-sub:
		t.Fatalf("expected no event, got %v", ev)
	case <-time.After(50 * time.Millisecond):
		// good — no event published
	}
}

func TestMarkUnseenListingsRemoved_EmptyInput(t *testing.T) {
	q := newFakeQueries()
	q.unseenN = 5 // would return 5 if called without the early-return guard

	bus := events.NewBus(8)
	defer bus.Close()
	s := New(q, nil, testParserStore(t), bus, nil)

	// Call with empty slice — must return (0, nil) without panicking.
	n, err := s.queries.MarkUnseenListingsRemoved(context.Background(), 1, []string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != 0 {
		t.Fatalf("expected 0 rows affected, got %d", n)
	}
}
