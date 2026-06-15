package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Hari-Hristov/the-great-find/backend/internal/events"
	"github.com/Hari-Hristov/the-great-find/backend/internal/scheduler"
)

func newTestServer(t *testing.T, q Queries, sched Reloader) (*httptest.Server, *events.Bus) {
	t.Helper()
	return newTestServerWithConfig(t, q, sched, &fakeConfig{})
}

func newTestServerWithConfig(t *testing.T, q Queries, sched Reloader, cfg ConfigProvider) (*httptest.Server, *events.Bus) {
	t.Helper()
	bus := events.NewBus(8)
	t.Cleanup(bus.Close)

	mux := http.NewServeMux()
	mux.Handle("/api/", http.StripPrefix("/api", New(q, sched, cfg)))
	mux.Handle("/events", NewSSE(bus))

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, bus
}

func httpJSON(t *testing.T, method, url string, body any) (int, []byte) {
	t.Helper()
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(context.Background(), method, url, rdr)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()
	out, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return resp.StatusCode, out
}

func TestCreateSearch_TriggersReload(t *testing.T) {
	q := newFakeQueries()
	rl := &fakeReloader{}
	srv, _ := newTestServer(t, q, rl)

	body := map[string]any{
		"name":              "iPhones",
		"query_params":      map[string]string{"keyword": "iphone"},
		"poll_interval_min": 30,
	}
	status, raw := httpJSON(t, "POST", srv.URL+"/api/searches", body)
	if status != 201 {
		t.Fatalf("status = %d, body=%s", status, raw)
	}
	var got struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Name != "iPhones" {
		t.Errorf("name=%q", got.Name)
	}
	if got.ID == 0 {
		t.Errorf("id should be assigned")
	}
	rl.mu.Lock()
	calls := rl.calls
	rl.mu.Unlock()
	if calls != 1 {
		t.Errorf("Reload calls = %d, want 1", calls)
	}
}

func TestCreateSearch_RejectsBadQueryParams(t *testing.T) {
	q := newFakeQueries()
	srv, _ := newTestServer(t, q, &fakeReloader{})

	body := map[string]any{
		"name":         "broken",
		"query_params": "not-an-object",
	}
	status, _ := httpJSON(t, "POST", srv.URL+"/api/searches", body)
	if status < 400 || status >= 500 {
		t.Fatalf("expected 4xx, got %d", status)
	}
}

func TestUpdateSearch_NotFoundIs404(t *testing.T) {
	q := newFakeQueries()
	srv, _ := newTestServer(t, q, &fakeReloader{})

	body := map[string]any{
		"name":              "ghost",
		"query_params":      map[string]string{"keyword": "x"},
		"poll_interval_min": 30,
	}
	status, _ := httpJSON(t, "PUT", srv.URL+"/api/searches/999", body)
	if status != 404 {
		t.Fatalf("status = %d, want 404", status)
	}
}

func TestDeleteSearch_TriggersReload(t *testing.T) {
	q := newFakeQueries()
	rl := &fakeReloader{}
	srv, _ := newTestServer(t, q, rl)

	created, err := q.CreateSavedSearch(context.Background(), CreateSavedSearchInput{
		Name: "x", Platform: "olx", Country: "BG",
		QueryParams: `{"keyword":"x"}`, PollIntervalMin: 30, Active: true,
	})
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	status, _ := httpJSON(t, "DELETE", srv.URL+"/api/searches/"+itoa(created.ID), nil)
	if status != 204 {
		t.Fatalf("status = %d, want 204", status)
	}
	rl.mu.Lock()
	calls := rl.calls
	rl.mu.Unlock()
	if calls != 1 {
		t.Errorf("Reload calls = %d, want 1", calls)
	}
}

func TestListings_AddsPriceEUR(t *testing.T) {
	q := newFakeQueries()
	amount := 1955.83
	q.listings[1] = ListingRow{
		ID: 1, Platform: "olx", Country: "BG", ExternalID: "abc",
		URL: "https://olx.bg/x", Title: "Phone",
		PriceAmount: &amount, PriceCurrency: "BGN",
		Status: "active", ScrapedLastAt: time.Now().UTC(),
	}
	srv, _ := newTestServer(t, q, &fakeReloader{})

	status, raw := httpJSON(t, "GET", srv.URL+"/api/listings", nil)
	if status != 200 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var resp struct {
		Items []ListingRow `json:"items"`
		Total int          `json:"total"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		t.Fatalf("decode: %v body=%s", err, raw)
	}
	if len(resp.Items) != 1 {
		t.Fatalf("got %d items", len(resp.Items))
	}
	if resp.Total != 1 {
		t.Errorf("total = %d, want 1", resp.Total)
	}
	got := resp.Items[0]
	if got.PriceEUR == nil {
		t.Fatalf("price_eur missing")
	}
	if v := *got.PriceEUR; v < 999 || v > 1001 {
		t.Errorf("price_eur = %v, want ~1000", v)
	}
}

func TestSSE_StreamsBusEvents(t *testing.T) {
	q := newFakeQueries()
	srv, bus := newTestServer(t, q, &fakeReloader{})

	req, err := http.NewRequestWithContext(context.Background(), "GET", srv.URL+"/events", nil)
	if err != nil {
		t.Fatalf("new req: %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status=%d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Errorf("Content-Type=%q", ct)
	}

	// Give the handler a moment to subscribe before publishing.
	time.Sleep(50 * time.Millisecond)
	bus.Publish(events.Event{
		Type:    events.TypeAlertFired,
		Payload: map[string]any{"listing_id": int64(7)},
	})

	// Read until we see an event:alert.fired frame or time out.
	deadline := time.Now().Add(2 * time.Second)
	buf := make([]byte, 4096)
	var seen string
	for time.Now().Before(deadline) {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			seen += string(buf[:n])
			if strings.Contains(seen, "event: alert.fired") {
				return
			}
		}
		if err != nil {
			break
		}
	}
	t.Fatalf("did not see alert.fired frame; saw=%q", seen)
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

func TestListSearches_Empty(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	status, raw := httpJSON(t, "GET", srv.URL+"/api/searches", nil)
	if status != 200 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var resp struct {
		Items []SavedSearchRow `json:"items"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Items) != 0 {
		t.Errorf("expected empty items, got %d", len(resp.Items))
	}
}

func TestListSearches_ReturnsCreated(t *testing.T) {
	q := newFakeQueries()
	srv, _ := newTestServer(t, q, &fakeReloader{})

	body := map[string]any{
		"name":              "test",
		"query_params":      map[string]string{"keyword": "laptop"},
		"poll_interval_min": 60,
	}
	statusCreate, _ := httpJSON(t, "POST", srv.URL+"/api/searches", body)
	if statusCreate != 201 {
		t.Fatalf("create status=%d", statusCreate)
	}

	status, raw := httpJSON(t, "GET", srv.URL+"/api/searches", nil)
	if status != 200 {
		t.Fatalf("list status=%d body=%s", status, raw)
	}
	var resp struct {
		Items []SavedSearchRow `json:"items"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(resp.Items))
	}
	if resp.Items[0].Name != "test" {
		t.Errorf("name=%q", resp.Items[0].Name)
	}
}

func TestGetSearch_NotFoundIs404(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	status, _ := httpJSON(t, "GET", srv.URL+"/api/searches/999", nil)
	if status != 404 {
		t.Fatalf("status=%d, want 404", status)
	}
}

func TestGetSearch_ReturnsExisting(t *testing.T) {
	q := newFakeQueries()
	srv, _ := newTestServer(t, q, &fakeReloader{})

	created, _ := q.CreateSavedSearch(context.Background(), CreateSavedSearchInput{
		Name: "find me", Platform: "olx", Country: "BG",
		QueryParams: `{"keyword":"car"}`, PollIntervalMin: 30, Active: true,
	})

	status, raw := httpJSON(t, "GET", srv.URL+"/api/searches/"+itoa(created.ID), nil)
	if status != 200 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var got SavedSearchRow
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Name != "find me" {
		t.Errorf("name=%q", got.Name)
	}
}

func TestCreateSearch_Defaults(t *testing.T) {
	q := newFakeQueries()
	srv, _ := newTestServer(t, q, &fakeReloader{})

	body := map[string]any{
		"name":         "minimal",
		"query_params": map[string]string{"keyword": "x"},
	}
	status, raw := httpJSON(t, "POST", srv.URL+"/api/searches", body)
	if status != 201 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var got SavedSearchRow
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Platform != "olx" {
		t.Errorf("platform=%q, want olx", got.Platform)
	}
	if got.Country != "BG" {
		t.Errorf("country=%q, want BG", got.Country)
	}
	if got.PollIntervalMin != 30 {
		t.Errorf("poll_interval_min=%d, want 30", got.PollIntervalMin)
	}
	if got.MaxListingAgeDays != 90 {
		t.Errorf("max_listing_age_days=%d, want 90", got.MaxListingAgeDays)
	}
	if !got.Active {
		t.Errorf("active should default to true")
	}
}

func TestCreateSearch_ActiveFalse(t *testing.T) {
	q := newFakeQueries()
	srv, _ := newTestServer(t, q, &fakeReloader{})

	inactive := false
	body := map[string]any{
		"name":         "inactive",
		"query_params": map[string]string{"keyword": "x"},
		"active":       inactive,
	}
	status, raw := httpJSON(t, "POST", srv.URL+"/api/searches", body)
	if status != 201 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var got SavedSearchRow
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Active {
		t.Errorf("expected active=false, got true")
	}
}

func TestCreateSearch_RejectsEmptyQueryParams(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	body := map[string]any{"name": "oops"}
	status, _ := httpJSON(t, "POST", srv.URL+"/api/searches", body)
	if status < 400 || status >= 500 {
		t.Fatalf("expected 4xx, got %d", status)
	}
}

func TestCreateSearch_RejectsBadAlertCriteria(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	body := map[string]any{
		"name":           "bad-alert",
		"query_params":   map[string]string{"keyword": "x"},
		"alert_criteria": "not-json",
	}
	status, _ := httpJSON(t, "POST", srv.URL+"/api/searches", body)
	if status < 400 || status >= 500 {
		t.Fatalf("expected 4xx, got %d", status)
	}
}

func TestUpdateSearch_SuccessTriggersReload(t *testing.T) {
	q := newFakeQueries()
	rl := &fakeReloader{}
	srv, _ := newTestServer(t, q, rl)

	created, _ := q.CreateSavedSearch(context.Background(), CreateSavedSearchInput{
		Name: "old", Platform: "olx", Country: "BG",
		QueryParams: `{"keyword":"old"}`, PollIntervalMin: 30, Active: true,
	})

	body := map[string]any{
		"name":              "new",
		"query_params":      map[string]string{"keyword": "new"},
		"poll_interval_min": 60,
	}
	status, raw := httpJSON(t, "PUT", srv.URL+"/api/searches/"+itoa(created.ID), body)
	if status != 200 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var got SavedSearchRow
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Name != "new" {
		t.Errorf("name=%q, want new", got.Name)
	}
	rl.mu.Lock()
	calls := rl.calls
	rl.mu.Unlock()
	if calls != 1 {
		t.Errorf("Reload calls=%d, want 1", calls)
	}
}

func TestDeleteSearch_NotFoundIs404(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	status, _ := httpJSON(t, "DELETE", srv.URL+"/api/searches/999", nil)
	if status != 404 {
		t.Fatalf("status=%d, want 404", status)
	}
}

func TestPollSearch_NotRunningIs404(t *testing.T) {
	rl := &fakeReloader{pollByIDErr: scheduler.ErrSearchNotRunning}
	srv, _ := newTestServer(t, newFakeQueries(), rl)

	status, _ := httpJSON(t, "POST", srv.URL+"/api/searches/1/poll", nil)
	if status != 404 {
		t.Fatalf("status=%d, want 404", status)
	}
}

func TestPollSearch_Success(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	status, _ := httpJSON(t, "POST", srv.URL+"/api/searches/1/poll", nil)
	if status != 202 {
		t.Fatalf("status=%d, want 202", status)
	}
}

func TestPollAllSearches_ReturnsCount(t *testing.T) {
	rl := &fakeReloader{pollAllCount: 3}
	srv, _ := newTestServer(t, newFakeQueries(), rl)

	status, raw := httpJSON(t, "POST", srv.URL+"/api/searches/poll", nil)
	if status != 202 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var resp struct {
		Count int `json:"count"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Count != 3 {
		t.Errorf("count=%d, want 3", resp.Count)
	}
}

func TestGetListing_NotFoundIs404(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	status, _ := httpJSON(t, "GET", srv.URL+"/api/listings/999", nil)
	if status != 404 {
		t.Fatalf("status=%d, want 404", status)
	}
}

func TestGetListing_ReturnsPhotosParamsAndPriceHistory(t *testing.T) {
	q := newFakeQueries()
	amount := 500.0
	q.listings[1] = ListingRow{
		ID: 1, Platform: "olx", Country: "BG", ExternalID: "x",
		URL: "https://olx.bg/x", Title: "Laptop",
		PriceAmount: &amount, PriceCurrency: "BGN",
		Status: "active", ScrapedLastAt: time.Now().UTC(),
	}
	q.photos[1] = []Photo{{URL: "https://img/1.jpg", Position: 0}}
	q.params[1] = []Param{{Key: "brand", Value: "Dell"}}
	obsAmount := 490.0
	q.history[1] = []PriceObservationRow{
		{ObservedAt: time.Now().UTC(), EventType: "first_seen", PriceAmount: &obsAmount, PriceCurrency: "BGN"},
	}

	srv, _ := newTestServer(t, q, &fakeReloader{})

	status, raw := httpJSON(t, "GET", srv.URL+"/api/listings/1", nil)
	if status != 200 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var resp struct {
		Listing      ListingRow            `json:"listing"`
		Photos       []Photo               `json:"photos"`
		Params       []Param               `json:"params"`
		PriceHistory []PriceObservationRow `json:"price_history"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Listing.PriceEUR == nil {
		t.Error("listing price_eur missing")
	}
	if len(resp.Photos) != 1 || resp.Photos[0].URL != "https://img/1.jpg" {
		t.Errorf("photos=%v", resp.Photos)
	}
	if len(resp.Params) != 1 || resp.Params[0].Key != "brand" {
		t.Errorf("params=%v", resp.Params)
	}
	if len(resp.PriceHistory) != 1 {
		t.Fatalf("price_history len=%d, want 1", len(resp.PriceHistory))
	}
	if resp.PriceHistory[0].PriceEUR == nil {
		t.Error("price_history[0].price_eur missing")
	}
}

func TestUpdateListingStatus_NotFoundIs404(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	body := map[string]any{"status": "hidden"}
	status, _ := httpJSON(t, "PATCH", srv.URL+"/api/listings/999", body)
	if status != 404 {
		t.Fatalf("status=%d, want 404", status)
	}
}

func TestUpdateListingStatus_UpdatesAndReturnsEnrichedRow(t *testing.T) {
	q := newFakeQueries()
	amount := 1955.83
	q.listings[1] = ListingRow{
		ID: 1, Platform: "olx", Country: "BG", ExternalID: "x",
		URL: "https://olx.bg/x", Title: "Phone",
		PriceAmount: &amount, PriceCurrency: "BGN",
		Status: "active", ScrapedLastAt: time.Now().UTC(),
	}

	srv, _ := newTestServer(t, q, &fakeReloader{})

	body := map[string]any{"status": "hidden"}
	status, raw := httpJSON(t, "PATCH", srv.URL+"/api/listings/1", body)
	if status != 200 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var got ListingRow
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Status != "hidden" {
		t.Errorf("status=%q, want hidden", got.Status)
	}
	if got.PriceEUR == nil {
		t.Error("price_eur missing after status update")
	}
}

func TestListListings_PostedAfterInvalidRFC3339(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	status, _ := httpJSON(t, "GET", srv.URL+"/api/listings?posted_after=not-a-date", nil)
	if status != 400 {
		t.Fatalf("status=%d, want 400", status)
	}
}

func TestListListings_Empty(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	status, raw := httpJSON(t, "GET", srv.URL+"/api/listings", nil)
	if status != 200 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var resp struct {
		Items []ListingRow `json:"items"`
		Total int          `json:"total"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Total != 0 || len(resp.Items) != 0 {
		t.Errorf("expected empty, got total=%d items=%d", resp.Total, len(resp.Items))
	}
}

func TestListAlerts_Empty(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	status, raw := httpJSON(t, "GET", srv.URL+"/api/alerts", nil)
	if status != 200 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var resp struct {
		Items []AlertRow `json:"items"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Items) != 0 {
		t.Errorf("expected empty items, got %d", len(resp.Items))
	}
}

func TestListAlerts_ReturnsSeedData(t *testing.T) {
	q := newFakeQueries()
	q.alerts = []AlertRow{
		{ID: 1, SearchID: 1, ListingID: 2, CriteriaHash: "abc", Criteria: `{}`, SentAt: time.Now().UTC()},
	}
	srv, _ := newTestServer(t, q, &fakeReloader{})

	status, raw := httpJSON(t, "GET", srv.URL+"/api/alerts", nil)
	if status != 200 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var resp struct {
		Items []AlertRow `json:"items"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(resp.Items))
	}
}

func TestTagAlert_NotFoundIs404(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	body := map[string]any{"tag_label": "good deal", "tag_color": "green"}
	status, _ := httpJSON(t, "PATCH", srv.URL+"/api/alerts/999", body)
	if status != 404 {
		t.Fatalf("status=%d, want 404", status)
	}
}

func TestTagAlert_InvalidColorIs422(t *testing.T) {
	q := newFakeQueries()
	q.alerts = []AlertRow{{ID: 1, SentAt: time.Now().UTC()}}
	srv, _ := newTestServer(t, q, &fakeReloader{})

	body := map[string]any{"tag_color": "chartreuse"}
	status, _ := httpJSON(t, "PATCH", srv.URL+"/api/alerts/1", body)
	if status != 422 {
		t.Fatalf("status=%d, want 422", status)
	}
}

func TestTagAlert_LabelTooLongIs422(t *testing.T) {
	q := newFakeQueries()
	q.alerts = []AlertRow{{ID: 1, SentAt: time.Now().UTC()}}
	srv, _ := newTestServer(t, q, &fakeReloader{})

	body := map[string]any{"tag_label": strings.Repeat("x", 101)}
	status, _ := httpJSON(t, "PATCH", srv.URL+"/api/alerts/1", body)
	if status != 422 {
		t.Fatalf("status=%d, want 422", status)
	}
}

func TestTagAlert_Success(t *testing.T) {
	q := newFakeQueries()
	q.alerts = []AlertRow{{ID: 1, SentAt: time.Now().UTC()}}
	srv, _ := newTestServer(t, q, &fakeReloader{})

	body := map[string]any{"tag_label": "good deal", "tag_color": "green"}
	status, _ := httpJSON(t, "PATCH", srv.URL+"/api/alerts/1", body)
	if status != 204 {
		t.Fatalf("status=%d, want 204", status)
	}
	q.mu.Lock()
	a := q.alerts[0]
	q.mu.Unlock()
	if a.TagLabel != "good deal" || a.TagColor != "green" {
		t.Errorf("tag not applied: label=%q color=%q", a.TagLabel, a.TagColor)
	}
}

func TestTagAlert_ClearTag(t *testing.T) {
	q := newFakeQueries()
	q.alerts = []AlertRow{{ID: 1, TagLabel: "stale", TagColor: "red", SentAt: time.Now().UTC()}}
	srv, _ := newTestServer(t, q, &fakeReloader{})

	body := map[string]any{"tag_label": nil, "tag_color": nil}
	status, _ := httpJSON(t, "PATCH", srv.URL+"/api/alerts/1", body)
	if status != 204 {
		t.Fatalf("status=%d, want 204", status)
	}
	q.mu.Lock()
	a := q.alerts[0]
	q.mu.Unlock()
	if a.TagLabel != "" || a.TagColor != "" {
		t.Errorf("tag not cleared: label=%q color=%q", a.TagLabel, a.TagColor)
	}
}

func TestSearchAnalytics_ReturnsRow(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	status, raw := httpJSON(t, "GET", srv.URL+"/api/analytics/searches/42", nil)
	if status != 200 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var got AnalyticsRow
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.SearchID != 42 {
		t.Errorf("search_id=%d, want 42", got.SearchID)
	}
	if got.WindowDays != 30 {
		t.Errorf("window_days=%d, want 30 (default)", got.WindowDays)
	}
	if got.TrendEUR == nil {
		t.Error("trend_eur should not be nil")
	}
}

func TestSearchAnalytics_CustomWindowDays(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	status, raw := httpJSON(t, "GET", srv.URL+"/api/analytics/searches/1?window_days=7", nil)
	if status != 200 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var got AnalyticsRow
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.WindowDays != 7 {
		t.Errorf("window_days=%d, want 7", got.WindowDays)
	}
}

func TestGetConfig_ReturnsCategories(t *testing.T) {
	q := newFakeQueries()
	cfg := &fakeConfig{categories: map[string]string{"electronics": "Electronics", "cars": "Cars"}}
	srv, _ := newTestServerWithConfig(t, q, &fakeReloader{}, cfg)

	status, raw := httpJSON(t, "GET", srv.URL+"/api/config", nil)
	if status != 200 {
		t.Fatalf("status=%d body=%s", status, raw)
	}
	var resp struct {
		Categories map[string]string `json:"categories"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Categories["electronics"] != "Electronics" {
		t.Errorf("categories=%v", resp.Categories)
	}
}

func TestSSE_Headers(t *testing.T) {
	srv, _ := newTestServer(t, newFakeQueries(), &fakeReloader{})

	req, err := http.NewRequestWithContext(context.Background(), "GET", srv.URL+"/events", nil)
	if err != nil {
		t.Fatalf("new req: %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer resp.Body.Close()

	if v := resp.Header.Get("Cache-Control"); v != "no-cache" {
		t.Errorf("Cache-Control=%q, want no-cache", v)
	}
	if v := resp.Header.Get("Connection"); v != "keep-alive" {
		t.Errorf("Connection=%q, want keep-alive", v)
	}
	if v := resp.Header.Get("X-Accel-Buffering"); v != "no" {
		t.Errorf("X-Accel-Buffering=%q, want no", v)
	}
}
