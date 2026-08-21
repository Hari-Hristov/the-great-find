// Package scraper turns olx.bg HTML pages into canonical Listing structs.
//
// Two-pass strategy:
//
//   1. Grid pass — fetch the search-results page(s), parse listing cards, return
//      partial Listings with the fields the grid renders (id, url, title, price,
//      location, primary image).
//   2. Detail enrich pass — for each listing we want full data on, fetch the
//      detail page and merge in description, posted_at, seller info, params, photos.
//
// All HTTP calls go through politeClient, which:
//
//   - Throttles per host: at most one in-flight request, with a configurable
//     spacing and jitter between requests so we behave like a polite human.
//   - Sets a stable User-Agent identifying the app + the personal-use scope.
//   - Honors context cancellation everywhere.
//
// The package never writes to the DB. It returns canonical structs to the
// scheduler, which decides what to upsert. This keeps the scraper a pure function
// over (URL, config) → Listings, which is trivial to snapshot-test.
package scraper

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"

	"github.com/Hari-Hristov/the-great-find/backend/internal/parser"
	"github.com/Hari-Hristov/the-great-find/backend/internal/politehttp"
)

// Listing is the canonical scraped form. The DB layer maps this onto its row shape.
//
// Fields are best-effort: the grid pass only fills what the search-results page
// shows, so most non-pointer fields may be the zero value. The detail pass
// fills the rest. Callers should treat empty strings / nil pointers as "unknown".
type Listing struct {
	ExternalID      string
	URL             string
	Title           string
	Description     string
	PriceAmount     *float64
	PriceCurrency   string
	PriceNegotiable bool
	LocationCity    string
	LocationRegion  string
	PostedAtRaw     string // raw "today at 14:32" / "Sep 12" / etc. — parsed by the scheduler
	PrimaryImageURL string
	PromotedTop     bool
	SellerName      string
	SellerType      string // private | business
	Params          map[string]string
	Photos          []string
}

// Client wraps a pluggable transport (politehttp.Doer) with politeness, plus
// the parser config it scrapes against. The transport is *http.Client by
// default; production may instead wire in *fetchproxy.Client to route
// requests through Electron's Chromium network stack (see
// backend/internal/fetchproxy) — the request-building and response-handling
// logic here is transport-agnostic either way.
type Client struct {
	http     politehttp.Doer
	cfg      *parser.Store
	hostGate *politehttp.HostGate
}

// NewClient builds a polite HTTP client. cfg is required; if hc is nil, a default
// http.Client with a 30s overall timeout is used. If hg is nil, a fresh HostGate
// is allocated — production wires the same gate into both scraper and apiclient
// so the per-host budget covers both paths.
func NewClient(cfg *parser.Store, hc politehttp.Doer, hg *politehttp.HostGate) (*Client, error) {
	if cfg == nil {
		return nil, errors.New("scraper: parser store is required")
	}
	if hc == nil {
		hc = &http.Client{Timeout: 30 * time.Second}
	}
	if hg == nil {
		hg = politehttp.NewHostGate()
	}
	return &Client{
		http:     hc,
		cfg:      cfg,
		hostGate: hg,
	}, nil
}

// FetchHTML retrieves a URL using the polite client and returns the response body.
// Exposed for tests and for callers that need raw HTML (e.g. param-discovery).
func (c *Client) FetchHTML(ctx context.Context, target string) ([]byte, error) {
	cfg := c.cfg.Get()
	parsedURL, err := url.Parse(target)
	if err != nil {
		return nil, fmt.Errorf("parse url: %w", err)
	}

	if err := c.hostGate.Acquire(ctx, parsedURL.Host, cfg.Robots); err != nil {
		return nil, err
	}
	defer c.hostGate.Release(parsedURL.Host)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("User-Agent", cfg.Robots.UserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("Accept-Language", "bg,en;q=0.9")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("get %s: %w", target, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("scraper: unexpected status %d from %s", resp.StatusCode, target)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}
	return body, nil
}

// ParseGrid extracts every listing card from the given grid HTML.
//
// Pure function over (HTML, config) — no I/O. Tests feed it fixture HTML.
func ParseGrid(html []byte, cfg *parser.Config) ([]Listing, error) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(html)))
	if err != nil {
		return nil, fmt.Errorf("parse grid html: %w", err)
	}

	cards := doc.Find(cfg.Grid.CardSelector)
	listings := make([]Listing, 0, cards.Length())

	cards.Each(func(_ int, card *goquery.Selection) {
		l := Listing{}
		for name, fx := range cfg.Grid.Fields {
			value, ok := extractField(card, fx, cfg.BaseURL)
			if !ok {
				continue
			}
			applyField(&l, name, value)
		}
		// A listing without an id or url is junk — drop it rather than write a half-row.
		if l.ExternalID == "" || l.URL == "" {
			return
		}
		listings = append(listings, l)
	})

	return listings, nil
}

// ParseDetail extracts the detail-page fields and merges them into base.
//
// base is typically the partial Listing returned by ParseGrid. The merge is
// non-destructive: a non-empty grid field is never overwritten by an empty
// detail field.
func ParseDetail(html []byte, cfg *parser.Config, base Listing) (Listing, error) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(html)))
	if err != nil {
		return base, fmt.Errorf("parse detail html: %w", err)
	}

	merged := base
	if merged.Params == nil {
		merged.Params = map[string]string{}
	}

	for name, fx := range cfg.Detail.Fields {
		value, ok := extractField(doc.Selection, fx, cfg.BaseURL)
		if !ok {
			continue
		}
		applyDetailField(&merged, name, value)
	}
	return merged, nil
}

// FetchAndParseGrid is the convenience method scheduler code uses for the grid pass.
func (c *Client) FetchAndParseGrid(ctx context.Context, target string) ([]Listing, error) {
	html, err := c.FetchHTML(ctx, target)
	if err != nil {
		return nil, err
	}
	return ParseGrid(html, c.cfg.Get())
}

// FetchAndParseDetail is the convenience method for the detail enrich pass.
func (c *Client) FetchAndParseDetail(ctx context.Context, base Listing) (Listing, error) {
	if base.URL == "" {
		return base, errors.New("scraper: detail enrich requires base.URL")
	}
	html, err := c.FetchHTML(ctx, base.URL)
	if err != nil {
		return base, err
	}
	return ParseDetail(html, c.cfg.Get(), base)
}

// FetchListingsForSearch is the scheduler.Fetcher implementation for the HTML
// path. Builds the search URL from the saved-search's query_params and fetches
// the first page. Pagination is intentionally NOT walked here yet — Phase 4's
// HTML poller used a single grid fetch per cycle, and the recency cutoff
// upstream means most queries fit on page 1. If a real saved search needs
// multiple pages, lift the loop here and use cfg.Grid.Pagination.
func (c *Client) FetchListingsForSearch(ctx context.Context, queryParamsJSON []byte) ([]Listing, error) {
	target, err := BuildSearchURL(c.cfg.Get(), queryParamsJSON)
	if err != nil {
		return nil, err
	}
	return c.FetchAndParseGrid(ctx, target)
}

// BuildSearchURL renders the search URL from the parser config + the saved
// search's query_params JSON.
//
// The grammar (driven by parser.Config.Search):
//
//   - Path is built by joining each segment named in SegmentOrder. A segment's
//     value comes from query_params[name], or PathSegments[name].Default if not
//     set. Empty resolved values collapse — no extra `/`. The "q_prefix" kind
//     wraps non-empty values as "q-{value}"; empty values collapse the segment.
//
//   - Remaining keys are looked up in QueryParams (alias → real olx.bg key) and
//     emitted as query string. Unknown aliases are silently dropped (allow-list).
//
//   - QueryParamDefaults fills any alias the saved search didn't set (e.g.
//     currency=EUR, sort=created_at:desc).
//
//   - QueryParamEnums is enforced: a value not in the allow-list returns an error.
//
// Path values are spliced into u.Path as their RAW unescaped form. u.String()
// percent-encodes them once on stringify; pre-escaping here would double-encode.
func BuildSearchURL(cfg *parser.Config, queryParamsJSON []byte) (string, error) {
	params := map[string]string{}
	if len(queryParamsJSON) > 0 {
		if err := json.Unmarshal(queryParamsJSON, &params); err != nil {
			return "", fmt.Errorf("decode query_params: %w", err)
		}
	}

	// Apply defaults for query-side aliases (path segments handle their own defaults below).
	for alias, def := range cfg.Search.QueryParamDefaults {
		if _, set := params[alias]; !set {
			params[alias] = def
		}
	}

	// Enforce enum constraints — fail loud rather than silently scrape with junk values.
	for alias, allowed := range cfg.Search.QueryParamEnums {
		v, set := params[alias]
		if !set || v == "" {
			continue
		}
		ok := false
		for _, a := range allowed {
			if v == a {
				ok = true
				break
			}
		}
		if !ok {
			return "", fmt.Errorf("query_params[%q]=%q not in allowed values %v", alias, v, allowed)
		}
	}

	// Build the path by joining each segment in declared order. A segment that
	// resolves to "" is dropped entirely.
	var pathSegs []string
	for _, name := range cfg.Search.SegmentOrder {
		spec := cfg.Search.PathSegments[name]
		val, set := params[name]
		if !set {
			val = spec.Default
		}
		val = strings.Trim(val, "/")
		if val == "" {
			delete(params, name)
			continue
		}
		switch spec.Kind {
		case "q_prefix":
			pathSegs = append(pathSegs, "q-"+val)
		case "raw_path":
			pathSegs = append(pathSegs, val)
		}
		delete(params, name)
	}

	u, err := url.Parse(cfg.BaseURL)
	if err != nil {
		return "", fmt.Errorf("parse base_url: %w", err)
	}
	basePath := strings.TrimRight(u.Path, "/")
	if len(pathSegs) > 0 {
		u.Path = basePath + "/" + strings.Join(pathSegs, "/") + "/"
	} else {
		u.Path = basePath + "/"
	}

	q := u.Query()
	for alias, value := range params {
		realKey, allowed := cfg.Search.QueryParams[alias]
		if !allowed || value == "" {
			continue
		}
		q.Set(realKey, value)
	}
	u.RawQuery = q.Encode()
	return u.String(), nil
}
