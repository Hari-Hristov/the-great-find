// Package parser owns the hot-reloadable selector config used by the scraper.
//
// The config lives at parser-config/olx-bg.json in this repo. At runtime the app:
//
//   1. Tries to fetch the latest version from a public GitHub URL we own.
//   2. Falls back to the embedded copy bundled into the binary if the fetch fails
//      or the schema is invalid.
//   3. Schema-validates the result before handing it to the scraper.
//
// The hot-reload exists because olx.bg changes its HTML occasionally — fixing
// selectors via a config push beats shipping a new binary for every CSS tweak.
package parser

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// Config is the schema of parser-config/olx-bg.json.
//
// Renames must bump SchemaVersion so the validator rejects mismatches.
type Config struct {
	SchemaVersion int          `json:"$schema_version"`
	Platform      string       `json:"platform"`
	Country       string       `json:"country"`
	UpdatedAt     string       `json:"updated_at"`
	Notes         string       `json:"notes,omitempty"`
	BaseURL       string       `json:"base_url"`
	Search        SearchConfig `json:"search"`
	Grid          GridConfig   `json:"grid"`
	Detail        DetailConfig `json:"detail"`
	Robots        RobotsConfig `json:"robots"`

	// API is the v3-and-up JSON ingestion contract. When non-nil and the
	// fetcher selection at boot picks the API path, the apiclient package uses
	// it to render request URLs and map response bodies onto scraper.Listing.
	// Nil → HTML scraper path is the only valid fetcher.
	API *APIConfig `json:"api,omitempty"`
}

type SearchConfig struct {
	// Path-segment grammar: olx.bg encodes category, location, and the keyword
	// as PATH segments rather than query params. Each segment lives at
	// PathSegments[name]; SegmentOrder controls how they're joined into the
	// final path. An empty resolved value collapses (no extra `/`).
	PathSegments map[string]PathSegmentSpec `json:"path_segments"`
	SegmentOrder []string                   `json:"segment_order"`

	// QueryParams maps the saved-search alias key (e.g. "price_min") to the
	// real olx.bg URL key (e.g. "search[filter_float_price:from]"). Anything
	// not in this allow-list is silently dropped at URL build time.
	QueryParams map[string]string `json:"query_params"`

	// QueryParamDefaults are applied when the saved search doesn't set the
	// alias. Used to force `currency=EUR` and a sane default sort.
	QueryParamDefaults map[string]string `json:"query_param_defaults,omitempty"`

	// QueryParamEnums constrains specific aliases to a set of allowed values
	// (e.g. condition ∈ {new, used}). Empty / missing → no enum check.
	QueryParamEnums map[string][]string `json:"query_param_enums,omitempty"`
}

// PathSegmentSpec describes how to render one path segment.
//
//   - Kind == "raw_path": the value is spliced verbatim into the path. Used for
//     pre-slugified category trees (e.g. "elektronika/igri-i-konzoli") and
//     pre-slugified locations (e.g. "oblast-sofiya-grad").
//   - Kind == "q_prefix": the value is wrapped as "q-{value}". Used for the
//     keyword segment. Empty value → segment is omitted entirely.
//
// Default is the fallback when the saved search doesn't set this segment.
// For category, the default is typically "ads" (olx.bg's catch-all root).
type PathSegmentSpec struct {
	Kind    string `json:"kind"`
	Default string `json:"default"`
}

type GridConfig struct {
	CardSelector string                  `json:"card_selector"`
	Fields       map[string]FieldExtract `json:"fields"`
	Pagination   PaginationConfig        `json:"pagination"`
}

type DetailConfig struct {
	Fields map[string]FieldExtract `json:"fields"`
}

// FieldExtract describes how to pull one field out of a parsed HTML node.
//
//   - Selector: CSS selector relative to the parent (card or detail page root).
//   - Attr: how to read the value:
//       "text"     — element's text content
//       "exists"   — boolean — whether the element matched
//       "list"     — collect text content of every match into a string slice
//       "src-list" — collect src attributes from every match
//       <name>     — read that specific attribute (href, src, id, ...)
//   - Absolute: if true, resolve href/src against BaseURL.
type FieldExtract struct {
	Selector string `json:"selector"`
	Attr     string `json:"attr"`
	Absolute bool   `json:"absolute,omitempty"`
}

type PaginationConfig struct {
	NextSelector string `json:"next_selector"`
	MaxPages     int    `json:"max_pages"`
}

type RobotsConfig struct {
	RespectRobotsTxt    bool   `json:"respect_robots_txt"`
	UserAgent           string `json:"user_agent"`
	MinRequestSpacingMs int    `json:"min_request_spacing_ms"`
	JitterMs            int    `json:"jitter_ms"`
	MaxInFlightPerHost  int    `json:"max_in_flight_per_host"`
}

// APIConfig describes how to talk to the platform's internal JSON listings API.
//
// Lives alongside the HTML scraper config so a single parser-config file covers
// both ingestion paths. Absent (nil) → the API path is unavailable and the
// scheduler falls back to HTML scraping.
type APIConfig struct {
	// ListPath is the URL path of the offers endpoint (e.g. "/api/v1/offers/").
	// Joined with Config.BaseURL to form the full request URL.
	ListPath string `json:"list_path"`

	// QueryParams maps the saved-search alias key (e.g. "price_min") to the
	// real API key (e.g. "search[filter_float_price:from]"). Anything not in
	// this allow-list is silently dropped at URL build time — same allow-list
	// discipline as SearchConfig.QueryParams.
	QueryParams map[string]string `json:"query_params"`

	// QueryParamDefaults are applied when the saved search doesn't set the alias
	// (e.g. force sort_by=created_at:desc). Mirrors the HTML path's defaults
	// behaviour so saved searches stay portable across paths.
	QueryParamDefaults map[string]string `json:"query_param_defaults,omitempty"`

	Pagination APIPagination   `json:"pagination"`
	Response   APIResponseSpec `json:"response"`
}

// APIPagination configures how the apiclient walks subsequent pages.
type APIPagination struct {
	// NextLinkPath is the dot-path into the JSON response carrying the next-page
	// URL (e.g. "links.next.href"). Empty/missing in the response → terminate.
	NextLinkPath string `json:"next_link_path"`
	// MaxPages is the safety cap. The pager stops at this many pages even if
	// next_link_path keeps producing URLs — protects against runaway loops.
	MaxPages int `json:"max_pages"`
}

// APIResponseSpec describes the shape of one offers response so the mapper
// stays driven by config rather than hard-coded JSON paths.
type APIResponseSpec struct {
	// ListingsPath is the dot-path to the array of offer objects (e.g. "data").
	ListingsPath string `json:"listings_path"`

	// Fields maps the canonical scraper.Listing field name to a JSON dot-path
	// inside one offer object. Numeric segments index arrays
	// (e.g. "photos.0.link" → first photo's link). Missing paths produce zero
	// values, matching the existing scraper.Listing "treat empty as unknown" rule.
	Fields map[string]string `json:"fields"`

	// PriceParamKey is the value of params[].key that carries the price object
	// on this platform (e.g. "price"). The mapper walks params[] to find the
	// matching entry and reads value.value + value.currency from it.
	PriceParamKey string `json:"price_param_key"`
}

// Validate enforces the invariants the scraper relies on.
//
// We deliberately fail closed: a malformed remote config must not nuke the running
// scraper. Callers should keep using the previous valid config on validation failure.
func (c *Config) Validate() error {
	if c.SchemaVersion == 0 {
		return errors.New("parser config: $schema_version is required")
	}
	if c.Platform == "" {
		return errors.New("parser config: platform is required")
	}
	if c.Country == "" {
		return errors.New("parser config: country is required")
	}
	if c.BaseURL == "" {
		return errors.New("parser config: base_url is required")
	}
	if len(c.Search.PathSegments) == 0 {
		return errors.New("parser config: search.path_segments must define at least one segment")
	}
	if len(c.Search.SegmentOrder) == 0 {
		return errors.New("parser config: search.segment_order is required")
	}
	for _, name := range c.Search.SegmentOrder {
		spec, ok := c.Search.PathSegments[name]
		if !ok {
			return fmt.Errorf("parser config: search.segment_order references unknown segment %q", name)
		}
		switch spec.Kind {
		case "raw_path", "q_prefix":
			// fine
		default:
			return fmt.Errorf("parser config: search.path_segments[%q].kind = %q (must be raw_path or q_prefix)", name, spec.Kind)
		}
	}
	for alias := range c.Search.QueryParamDefaults {
		if _, ok := c.Search.QueryParams[alias]; !ok {
			return fmt.Errorf("parser config: query_param_defaults[%q] has no entry in query_params", alias)
		}
	}
	for alias := range c.Search.QueryParamEnums {
		if _, ok := c.Search.QueryParams[alias]; !ok {
			return fmt.Errorf("parser config: query_param_enums[%q] has no entry in query_params", alias)
		}
	}
	if c.Grid.CardSelector == "" {
		return errors.New("parser config: grid.card_selector is required")
	}
	if len(c.Grid.Fields) == 0 {
		return errors.New("parser config: grid.fields must define at least one field")
	}
	for name, f := range c.Grid.Fields {
		if f.Selector == "" {
			return fmt.Errorf("parser config: grid.fields[%q].selector is empty", name)
		}
		if f.Attr == "" {
			return fmt.Errorf("parser config: grid.fields[%q].attr is empty", name)
		}
	}
	if c.Robots.UserAgent == "" {
		return errors.New("parser config: robots.user_agent is required (politeness)")
	}
	if c.Robots.MaxInFlightPerHost < 1 {
		return errors.New("parser config: robots.max_in_flight_per_host must be >= 1")
	}
	// v3 added the optional API block. Validate it only when present so v2 configs
	// (no `api` key, API == nil) keep validating untouched.
	if c.SchemaVersion >= 3 && c.API != nil {
		if err := c.API.validate(); err != nil {
			return err
		}
	}
	return nil
}

// validate is the API-block-only invariant check. Split out so Config.Validate
// can call it conditionally without leaking unrelated rules into the API path.
func (a *APIConfig) validate() error {
	if a.ListPath == "" {
		return errors.New("parser config: api.list_path is required")
	}
	if a.Response.ListingsPath == "" {
		return errors.New("parser config: api.response.listings_path is required")
	}
	if a.Response.PriceParamKey == "" {
		return errors.New("parser config: api.response.price_param_key is required")
	}
	if a.Pagination.MaxPages <= 0 {
		return errors.New("parser config: api.pagination.max_pages must be > 0")
	}
	for alias := range a.QueryParamDefaults {
		if _, ok := a.QueryParams[alias]; !ok {
			return fmt.Errorf("parser config: api.query_param_defaults[%q] has no entry in api.query_params", alias)
		}
	}
	return nil
}

// Decode parses raw JSON bytes into a Config and validates it in one step.
func Decode(raw []byte) (*Config, error) {
	var cfg Config
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&cfg); err != nil {
		return nil, fmt.Errorf("decode parser config: %w", err)
	}
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// Store is a goroutine-safe holder for the current parser Config.
//
// The scraper Get()s on every poll. Hot-reload writes a new pointer atomically
// so reads never block and a torn struct is impossible.
type Store struct {
	v atomic.Pointer[Config]
}

// NewStore wraps an initial validated config. The zero value of Store is unusable
// — callers must seed with a valid config (typically the embedded fallback) at boot.
func NewStore(initial *Config) *Store {
	if initial == nil {
		panic("parser.NewStore: initial config must be non-nil")
	}
	s := &Store{}
	s.v.Store(initial)
	return s
}

// Get returns the current config. Cheap; safe to call from many goroutines.
func (s *Store) Get() *Config { return s.v.Load() }

// Replace swaps in a new validated config and returns the previous one.
func (s *Store) Replace(c *Config) (*Config, error) {
	if c == nil {
		return nil, errors.New("parser.Replace: nil config")
	}
	if err := c.Validate(); err != nil {
		return nil, err
	}
	prev := s.v.Swap(c)
	return prev, nil
}

// Reloader pulls the parser config from a remote URL and replaces the Store on success.
//
// The fetcher is plain net/http with a small timeout. Failure is logged by the caller
// but never crashes the app: stale-but-valid is always preferred to broken.
type Reloader struct {
	store     *Store
	url       string
	client    *http.Client
	mu        sync.Mutex
	lastEtag  string
}

// NewReloader builds a Reloader. Pass an *http.Client with a sane timeout (we
// recommend 10s) — nil falls back to a fresh client with a 10s timeout.
func NewReloader(store *Store, url string, client *http.Client) *Reloader {
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &Reloader{store: store, url: url, client: client}
}

// FetchOnce performs one fetch+validate+swap cycle.
//
// Returns:
//   - replaced=true  → the store was updated.
//   - replaced=false → the remote was unchanged (304) or validation failed.
//   - err            → only set when the network call failed, the response was non-2xx,
//                      or the body could not be read. Validation failures are returned
//                      as a non-nil error with replaced=false (so the caller can log).
func (r *Reloader) FetchOnce(ctx context.Context) (replaced bool, err error) {
	r.mu.Lock()
	etag := r.lastEtag
	r.mu.Unlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.url, nil)
	if err != nil {
		return false, fmt.Errorf("build request: %w", err)
	}
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}

	resp, err := r.client.Do(req)
	if err != nil {
		return false, fmt.Errorf("fetch parser config: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotModified {
		return false, nil
	}
	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("fetch parser config: unexpected status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, fmt.Errorf("read body: %w", err)
	}

	cfg, err := Decode(body)
	if err != nil {
		return false, err
	}
	if _, err := r.store.Replace(cfg); err != nil {
		return false, err
	}

	r.mu.Lock()
	r.lastEtag = resp.Header.Get("ETag")
	r.mu.Unlock()
	return true, nil
}
