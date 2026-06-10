package parser

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const validJSON = `{
  "$schema_version": 2,
  "platform": "olx",
  "country": "BG",
  "updated_at": "2026-06-09",
  "base_url": "https://www.olx.bg",
  "search": {
    "path_segments": {
      "category": {"kind": "raw_path", "default": "ads"},
      "location": {"kind": "raw_path", "default": ""},
      "keyword":  {"kind": "q_prefix", "default": ""}
    },
    "segment_order": ["category", "location", "keyword"],
    "query_params": {
      "price_min": "search[filter_float_price:from]",
      "currency":  "currency",
      "sort":      "search[order]"
    },
    "query_param_defaults": {"currency": "EUR"},
    "query_param_enums":    {"currency": ["EUR", "BGN"]}
  },
  "grid": {
    "card_selector": "div[data-cy='l-card']",
    "fields": {
      "external_id": {"selector": "div[data-cy='l-card']", "attr": "id"}
    },
    "pagination": {
      "next_selector": "a[data-testid='pagination-forward']",
      "max_pages": 20
    }
  },
  "detail": {"fields": {}},
  "robots": {
    "respect_robots_txt": true,
    "user_agent": "test-agent",
    "min_request_spacing_ms": 1500,
    "jitter_ms": 750,
    "max_in_flight_per_host": 1
  }
}`

func TestEmbeddedOLXBG_ParsesAndValidates(t *testing.T) {
	cfg, err := EmbeddedOLXBG()
	if err != nil {
		t.Fatalf("embedded config invalid: %v", err)
	}
	if cfg.Platform != "olx" || cfg.Country != "BG" {
		t.Errorf("embedded config has unexpected platform/country: %s/%s", cfg.Platform, cfg.Country)
	}
	if cfg.SchemaVersion < 3 {
		t.Errorf("embedded config schema_version = %d, want >= 3", cfg.SchemaVersion)
	}
	if cfg.API == nil {
		t.Fatal("embedded config: api block is nil; expected v3 api block")
	}
	if cfg.API.ListPath == "" {
		t.Error("embedded config: api.list_path is empty")
	}
	if cfg.API.Response.PriceParamKey == "" {
		t.Error("embedded config: api.response.price_param_key is empty")
	}
}

func TestDecode_ValidJSON(t *testing.T) {
	cfg, err := Decode([]byte(validJSON))
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	if cfg.SchemaVersion != 2 {
		t.Errorf("SchemaVersion = %d, want 2", cfg.SchemaVersion)
	}
}

func TestDecode_RejectsUnknownFields(t *testing.T) {
	tampered := strings.Replace(validJSON, `"updated_at": "2026-06-05",`,
		`"updated_at": "2026-06-05", "evil_field": true,`, 1)
	if _, err := Decode([]byte(tampered)); err == nil {
		t.Fatal("expected error on unknown field")
	}
}

func TestValidate_RequiresFields(t *testing.T) {
	tests := []struct {
		name string
		mut  func(c *Config)
	}{
		{"no schema_version", func(c *Config) { c.SchemaVersion = 0 }},
		{"no platform", func(c *Config) { c.Platform = "" }},
		{"no country", func(c *Config) { c.Country = "" }},
		{"no base_url", func(c *Config) { c.BaseURL = "" }},
		{"no path_segments", func(c *Config) { c.Search.PathSegments = nil }},
		{"no segment_order", func(c *Config) { c.Search.SegmentOrder = nil }},
		{"segment_order references unknown segment", func(c *Config) {
			c.Search.SegmentOrder = []string{"category", "ghost"}
		}},
		{"path segment with unknown kind", func(c *Config) {
			c.Search.PathSegments["category"] = PathSegmentSpec{Kind: "weird", Default: ""}
		}},
		{"default for unknown query alias", func(c *Config) {
			c.Search.QueryParamDefaults = map[string]string{"ghost": "x"}
		}},
		{"enum for unknown query alias", func(c *Config) {
			c.Search.QueryParamEnums = map[string][]string{"ghost": {"x"}}
		}},
		{"no card_selector", func(c *Config) { c.Grid.CardSelector = "" }},
		{"no grid fields", func(c *Config) { c.Grid.Fields = nil }},
		{"no user_agent", func(c *Config) { c.Robots.UserAgent = "" }},
		{"max_in_flight zero", func(c *Config) { c.Robots.MaxInFlightPerHost = 0 }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cfg, err := Decode([]byte(validJSON))
			if err != nil {
				t.Fatalf("baseline decode: %v", err)
			}
			tc.mut(cfg)
			if err := cfg.Validate(); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestStore_AtomicReplace(t *testing.T) {
	initial, err := Decode([]byte(validJSON))
	if err != nil {
		t.Fatalf("initial decode: %v", err)
	}
	store := NewStore(initial)
	if got := store.Get(); got.SchemaVersion != 1 {
		t.Errorf("Get returned wrong config")
	}

	next, _ := Decode([]byte(validJSON))
	next.UpdatedAt = "2030-01-01"
	prev, err := store.Replace(next)
	if err != nil {
		t.Fatalf("Replace: %v", err)
	}
	if prev.UpdatedAt == "2030-01-01" {
		t.Error("prev should be the old config, not the new one")
	}
	if store.Get().UpdatedAt != "2030-01-01" {
		t.Error("store did not pick up the replacement")
	}
}

func TestStore_ReplaceRejectsInvalid(t *testing.T) {
	initial, _ := Decode([]byte(validJSON))
	store := NewStore(initial)

	bad := *initial
	bad.Platform = ""
	if _, err := store.Replace(&bad); err == nil {
		t.Fatal("Replace should reject invalid config")
	}
	if store.Get().Platform == "" {
		t.Fatal("Replace failure mutated the live config")
	}
}

func TestReloader_FetchesAndReplaces(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("ETag", `"v2"`)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(validJSON))
	}))
	defer server.Close()

	initial, _ := Decode([]byte(validJSON))
	store := NewStore(initial)
	r := NewReloader(store, server.URL, server.Client())

	replaced, err := r.FetchOnce(context.Background())
	if err != nil {
		t.Fatalf("FetchOnce: %v", err)
	}
	if !replaced {
		t.Fatal("FetchOnce should report replaced=true")
	}
}

func TestReloader_HandlesNotModified(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotModified)
	}))
	defer server.Close()

	initial, _ := Decode([]byte(validJSON))
	store := NewStore(initial)
	r := NewReloader(store, server.URL, server.Client())

	replaced, err := r.FetchOnce(context.Background())
	if err != nil {
		t.Fatalf("FetchOnce: %v", err)
	}
	if replaced {
		t.Fatal("304 should report replaced=false")
	}
}

func TestReloader_RejectsBadStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	initial, _ := Decode([]byte(validJSON))
	store := NewStore(initial)
	r := NewReloader(store, server.URL, server.Client())

	if _, err := r.FetchOnce(context.Background()); err == nil {
		t.Fatal("expected error on 500")
	}
}

func TestReloader_RejectsInvalidPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"$schema_version": 0}`))
	}))
	defer server.Close()

	initial, _ := Decode([]byte(validJSON))
	store := NewStore(initial)
	r := NewReloader(store, server.URL, server.Client())

	replaced, err := r.FetchOnce(context.Background())
	if err == nil {
		t.Fatal("expected validation error")
	}
	if replaced {
		t.Fatal("invalid payload should not replace the live config")
	}
	if store.Get().SchemaVersion != 2 {
		t.Fatal("invalid payload mutated the live config")
	}
}

// validJSONv3 is the v2 baseline plus an `api` block, used to exercise the
// schema v3 validator paths without touching the original v2 tests.
const validJSONv3 = `{
  "$schema_version": 3,
  "platform": "olx",
  "country": "BG",
  "updated_at": "2026-06-10",
  "base_url": "https://www.olx.bg",
  "search": {
    "path_segments": {
      "category": {"kind": "raw_path", "default": "ads"},
      "location": {"kind": "raw_path", "default": ""},
      "keyword":  {"kind": "q_prefix", "default": ""}
    },
    "segment_order": ["category", "location", "keyword"],
    "query_params": {
      "price_min": "search[filter_float_price:from]",
      "currency":  "currency",
      "sort":      "search[order]"
    },
    "query_param_defaults": {"currency": "EUR"},
    "query_param_enums":    {"currency": ["EUR", "BGN"]}
  },
  "grid": {
    "card_selector": "div[data-cy='l-card']",
    "fields": {
      "external_id": {"selector": "div[data-cy='l-card']", "attr": "id"}
    },
    "pagination": {
      "next_selector": "a[data-testid='pagination-forward']",
      "max_pages": 20
    }
  },
  "detail": {"fields": {}},
  "robots": {
    "respect_robots_txt": true,
    "user_agent": "test-agent",
    "min_request_spacing_ms": 1500,
    "jitter_ms": 750,
    "max_in_flight_per_host": 1
  },
  "api": {
    "list_path": "/api/v1/offers/",
    "query_params": {
      "keyword":   "query",
      "price_min": "search[filter_float_price:from]",
      "sort":      "sort_by"
    },
    "query_param_defaults": {"sort": "created_at:desc"},
    "pagination": {"next_link_path": "links.next.href", "max_pages": 25},
    "response": {
      "listings_path": "data",
      "fields": {"external_id": "id", "url": "url", "title": "title"},
      "price_param_key": "price"
    }
  }
}`

func TestDecode_V3WithAPIBlock(t *testing.T) {
	cfg, err := Decode([]byte(validJSONv3))
	if err != nil {
		t.Fatalf("Decode v3: %v", err)
	}
	if cfg.SchemaVersion != 3 {
		t.Errorf("SchemaVersion = %d, want 3", cfg.SchemaVersion)
	}
	if cfg.API == nil {
		t.Fatal("API block decoded as nil")
	}
	if cfg.API.ListPath != "/api/v1/offers/" {
		t.Errorf("API.ListPath = %q", cfg.API.ListPath)
	}
}

func TestValidate_V2StillValidatesAgainstV3Struct(t *testing.T) {
	// Backwards compat: v2 JSON has no `api` field — API stays nil and the
	// API-block validator is skipped entirely.
	cfg, err := Decode([]byte(validJSON))
	if err != nil {
		t.Fatalf("v2 decode against v3 struct: %v", err)
	}
	if cfg.API != nil {
		t.Fatal("v2 config produced non-nil API; should be nil (omitempty)")
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("v2 Validate: %v", err)
	}
}

func TestValidate_V3RequiresAPIFields(t *testing.T) {
	tests := []struct {
		name string
		mut  func(c *Config)
	}{
		{"api.list_path empty", func(c *Config) { c.API.ListPath = "" }},
		{"api.response.listings_path empty", func(c *Config) { c.API.Response.ListingsPath = "" }},
		{"api.response.price_param_key empty", func(c *Config) { c.API.Response.PriceParamKey = "" }},
		{"api.pagination.max_pages zero", func(c *Config) { c.API.Pagination.MaxPages = 0 }},
		{"api.query_param_defaults references unknown alias", func(c *Config) {
			c.API.QueryParamDefaults = map[string]string{"ghost": "x"}
		}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cfg, err := Decode([]byte(validJSONv3))
			if err != nil {
				t.Fatalf("baseline decode: %v", err)
			}
			tc.mut(cfg)
			if err := cfg.Validate(); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestValidate_V3WithoutAPIBlockStillValid(t *testing.T) {
	// A v3-numbered config with no api block is legal — the API-block validator
	// is gated on API != nil. Useful for platforms that haven't been wired to
	// the JSON path yet.
	cfg, err := Decode([]byte(validJSONv3))
	if err != nil {
		t.Fatalf("baseline decode: %v", err)
	}
	cfg.API = nil
	if err := cfg.Validate(); err != nil {
		t.Fatalf("v3 with API=nil should still validate: %v", err)
	}
}
