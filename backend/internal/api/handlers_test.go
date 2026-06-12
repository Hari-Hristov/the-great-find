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
)

func newTestServer(t *testing.T, q Queries, sched Reloader) (*httptest.Server, *events.Bus) {
	t.Helper()
	bus := events.NewBus(8)
	t.Cleanup(bus.Close)

	mux := http.NewServeMux()
	mux.Handle("/api/", http.StripPrefix("/api", New(q, sched)))
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
		_ = resp.Body.(interface{ SetReadDeadline(time.Time) error })
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
