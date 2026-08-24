package apiclient

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/Hari-Hristov/the-great-find/backend/internal/fetchproxy"
	"github.com/Hari-Hristov/the-great-find/backend/internal/parser"
	"github.com/Hari-Hristov/the-great-find/backend/internal/politehttp"
)

// newTestStore returns a parser.Store seeded from the embedded olx-bg config
// but rebased onto the provided BaseURL — so URL building lands on the
// httptest server, not the real olx.bg.
func newTestStore(t *testing.T, baseURL string) *parser.Store {
	t.Helper()
	cfg, err := parser.EmbeddedOLXBG()
	if err != nil {
		t.Fatalf("load embedded parser config: %v", err)
	}
	cfg.BaseURL = baseURL
	return parser.NewStore(cfg)
}

func TestClient_BuildURL_AppliesDefaultsAndAllowList(t *testing.T) {
	store := newTestStore(t, "https://example.test")
	c, err := NewClient(store, http.DefaultClient, politehttp.NewHostGate())
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	got, err := c.BuildURL([]byte(`{"keyword":"laptop","price_min":"200","price_max":"500","evil_param":"x"}`))
	if err != nil {
		t.Fatalf("BuildURL: %v", err)
	}

	u, err := url.Parse(got)
	if err != nil {
		t.Fatalf("parse built url: %v", err)
	}
	if u.Path != "/api/v1/offers/" {
		t.Errorf("Path = %q", u.Path)
	}
	q := u.Query()
	if q.Get("query") != "laptop" {
		t.Errorf("query=%q, want laptop", q.Get("query"))
	}
	if q.Get("search[filter_float_price:from]") != "200" {
		t.Errorf("price_min didn't map to search[filter_float_price:from]; got %q", q.Get("search[filter_float_price:from]"))
	}
	if q.Get("search[filter_float_price:to]") != "500" {
		t.Errorf("price_max didn't map; got %q", q.Get("search[filter_float_price:to]"))
	}
	// Defaults filled in.
	if q.Get("sort_by") != "created_at:desc" {
		t.Errorf("default sort lost; got sort_by=%q", q.Get("sort_by"))
	}
	if q.Get("limit") != "40" {
		t.Errorf("default limit lost; got %q", q.Get("limit"))
	}
	// Unknown alias dropped.
	if q.Get("evil_param") != "" {
		t.Errorf("evil_param leaked: %q", q.Get("evil_param"))
	}
}

func TestClient_BuildURL_CyrillicKeywordEncodedOnce(t *testing.T) {
	// Regression coverage analogous to the HTML buildSearchURL Cyrillic test.
	// url.Values.Encode handles single-encoding for us — this test is the seatbelt.
	store := newTestStore(t, "https://example.test")
	c, _ := NewClient(store, http.DefaultClient, politehttp.NewHostGate())

	got, err := c.BuildURL([]byte(`{"keyword":"книга"}`))
	if err != nil {
		t.Fatalf("BuildURL: %v", err)
	}
	if strings.Contains(got, "%2520") || strings.Contains(got, "%25D0") {
		t.Errorf("double-encoded url: %s", got)
	}
	if !strings.Contains(got, "%D0%BA%D0%BD%D0%B8%D0%B3%D0%B0") {
		t.Errorf("expected single-encoded cyrillic keyword: %s", got)
	}
}

func TestClient_FetchListings_ReturnsListingsAndNext(t *testing.T) {
	// Capture the test server URL so the next.href can point back to it.
	var nextHref string
	body := func() []byte {
		out, _ := json.Marshal(map[string]any{
			"data": []any{
				map[string]any{
					"id":           111,
					"url":          "https://www.olx.bg/item/x-CID5-ID111.html",
					"title":        "x",
					"created_time": "2026-06-09T14:32:00+03:00",
					"business":     false,
					"location":     map[string]any{"city": map[string]any{"name": "София"}},
					"params": []any{
						map[string]any{
							"key":   "price",
							"value": map[string]any{"value": 99.0, "currency": "EUR"},
						},
					},
				},
			},
			"links": map[string]any{"next": map[string]any{"href": nextHref}},
		})
		return out
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body())
	}))
	defer srv.Close()
	nextHref = srv.URL + "/api/v1/offers/?offset=40"

	store := newTestStore(t, srv.URL)
	c, _ := NewClient(store, srv.Client(), politehttp.NewHostGate())

	target, err := c.BuildURL([]byte(`{"keyword":"x"}`))
	if err != nil {
		t.Fatalf("BuildURL: %v", err)
	}
	listings, gotNext, err := c.FetchListings(context.Background(), target)
	if err != nil {
		t.Fatalf("FetchListings: %v", err)
	}
	if len(listings) != 1 {
		t.Fatalf("got %d listings, want 1", len(listings))
	}
	if listings[0].ExternalID != "111" {
		t.Errorf("ExternalID = %q", listings[0].ExternalID)
	}
	if gotNext != nextHref {
		t.Errorf("nextURL = %q, want %q", gotNext, nextHref)
	}
}

func TestClient_FetchListings_RejectsNon2xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	store := newTestStore(t, srv.URL)
	c, _ := NewClient(store, srv.Client(), politehttp.NewHostGate())

	_, _, err := c.FetchListings(context.Background(), srv.URL+"/api/v1/offers/")
	if err == nil {
		t.Fatal("expected error on 429")
	}
}

func TestClient_FetchAll_WalksPaginationAndStopsAtMaxPages(t *testing.T) {
	var calls atomic.Int32
	var srvURL string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		page := calls.Add(1)
		// Always return next.href pointing back to the test server until the
		// MaxPages cap kicks in.
		body, _ := json.Marshal(map[string]any{
			"data": []any{
				map[string]any{
					"id":    int(page),
					"url":   "https://x.test/" + string(rune('a'+(page%26))),
					"title": "page",
					"params": []any{
						map[string]any{
							"key":   "price",
							"value": map[string]any{"value": 1.0, "currency": "EUR"},
						},
					},
				},
			},
			"links": map[string]any{"next": map[string]any{"href": srvURL + "/api/v1/offers/?offset=" + string(rune('0'+page))}},
		})
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	defer srv.Close()
	srvURL = srv.URL

	store := newTestStore(t, srv.URL)
	// Force a small max_pages so the test finishes fast and proves the cap.
	cur := store.Get()
	cur.API.Pagination.MaxPages = 3
	if _, err := store.Replace(cur); err != nil {
		t.Fatalf("replace: %v", err)
	}

	c, _ := NewClient(store, srv.Client(), politehttp.NewHostGate())
	got, err := c.FetchAll(context.Background(), srv.URL+"/api/v1/offers/")
	if err != nil {
		t.Fatalf("FetchAll: %v", err)
	}
	if len(got) != 3 {
		t.Errorf("got %d listings, want 3 (one per page, capped at MaxPages)", len(got))
	}
	if calls.Load() != 3 {
		t.Errorf("server calls = %d, want 3", calls.Load())
	}
}

func TestClient_BuildURL_CategorySlugResolvedToID(t *testing.T) {
	store := newTestStore(t, "https://example.test")
	c, _ := NewClient(store, http.DefaultClient, politehttp.NewHostGate())

	got, err := c.BuildURL([]byte(`{"keyword":"mac mini","category":"elektronika/kompyutri/nastolni-kompyutri"}`))
	if err != nil {
		t.Fatalf("BuildURL: %v", err)
	}
	u, _ := url.Parse(got)
	q := u.Query()
	if q.Get("category_id") != "872" {
		t.Errorf("category_id = %q, want 872", q.Get("category_id"))
	}
	if q.Get("category") != "" {
		t.Errorf("raw 'category' key leaked into URL: %q", q.Get("category"))
	}
}

func TestClient_BuildURL_UnknownCategorySlugForwardedAsID(t *testing.T) {
	store := newTestStore(t, "https://example.test")
	c, _ := NewClient(store, http.DefaultClient, politehttp.NewHostGate())

	got, err := c.BuildURL([]byte(`{"keyword":"chair","category":"mebeli/stolove"}`))
	if err != nil {
		t.Fatalf("BuildURL: %v", err)
	}
	u, _ := url.Parse(got)
	q := u.Query()
	if q.Get("category_id") != "mebeli/stolove" {
		t.Errorf("category_id = %q, want mebeli/stolove (slug forwarded)", q.Get("category_id"))
	}
}

// TestClient_FetchListings_ViaFetchProxy_MapsOffersEndToEnd stands in for
// Electron: an httptest.Server speaking the /fetch envelope protocol
// (see backend/internal/fetchproxy) instead of serving olx.bg directly.
// fetchproxy.Client is injected as the politehttp.Doer, proving the
// apiclient <-> fetchproxy <-> "Electron" path maps offers identically to
// the direct *http.Client path exercised by the other tests in this file.
func TestClient_FetchListings_ViaFetchProxy_MapsOffersEndToEnd(t *testing.T) {
	const wantToken = "test-bearer-token"

	offersJSON, _ := json.Marshal(map[string]any{
		"data": []any{
			map[string]any{
				"id":           222,
				"url":          "https://www.olx.bg/item/y-CID5-ID222.html",
				"title":        "y",
				"created_time": "2026-06-09T14:32:00+03:00",
				"business":     false,
				"location":     map[string]any{"city": map[string]any{"name": "Пловдив"}},
				"params": []any{
					map[string]any{
						"key":   "price",
						"value": map[string]any{"value": 150.0, "currency": "EUR"},
					},
				},
			},
		},
		"links": map[string]any{"next": map[string]any{"href": ""}},
	})

	// Fake Electron: validates the envelope's shape/auth, then replies with
	// the documented response envelope — status 200 upstream, offersJSON
	// carried as body_b64.
	electron := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+wantToken {
			t.Errorf("Authorization = %q, want Bearer %s", got, wantToken)
		}
		var req fetchproxy.EnvRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode envelope: %v", err)
		}
		if req.Method != http.MethodGet {
			t.Errorf("envelope method = %q, want GET", req.Method)
		}

		resp := fetchproxy.EnvResponse{
			Status:  http.StatusOK,
			Headers: map[string]string{"content-type": "application/json"},
			BodyB64: base64.StdEncoding.EncodeToString(offersJSON),
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer electron.Close()

	fpClient := fetchproxy.New(electron.URL, wantToken)

	// BaseURL doesn't need to be reachable — fetchproxy.Client always POSTs
	// to its own baseURL (the fake Electron server above), carrying the
	// "real" target URL inside the envelope rather than dialing it directly.
	store := newTestStore(t, "https://www.olx.bg")
	c, err := NewClient(store, fpClient, politehttp.NewHostGate())
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	target, err := c.BuildURL([]byte(`{"keyword":"y"}`))
	if err != nil {
		t.Fatalf("BuildURL: %v", err)
	}

	listings, _, err := c.FetchListings(context.Background(), target)
	if err != nil {
		t.Fatalf("FetchListings: %v", err)
	}
	if len(listings) != 1 {
		t.Fatalf("got %d listings, want 1", len(listings))
	}
	if listings[0].ExternalID != "222" {
		t.Errorf("ExternalID = %q, want 222", listings[0].ExternalID)
	}
	if listings[0].LocationCity != "Пловдив" {
		t.Errorf("LocationCity = %q, want Пловдив", listings[0].LocationCity)
	}
	if listings[0].PriceAmount == nil || *listings[0].PriceAmount != 150.0 {
		t.Errorf("PriceAmount = %v, want 150.0", listings[0].PriceAmount)
	}
}

func TestNewClient_RejectsConfigWithoutAPI(t *testing.T) {
	cfg, _ := parser.EmbeddedOLXBG()
	cfg.API = nil
	store := parser.NewStore(cfg)
	if _, err := NewClient(store, http.DefaultClient, politehttp.NewHostGate()); err == nil {
		t.Fatal("expected NewClient to refuse a config with no api block")
	}
}
