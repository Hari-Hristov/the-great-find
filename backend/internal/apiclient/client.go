// Package apiclient consumes olx.bg's internal JSON listings API at
// /api/v1/offers/ and maps each offer onto the canonical scraper.Listing
// shape the rest of the app already speaks.
//
// Why a parallel client (vs. extending the scraper):
//
//   - The HTML scraper sees ~4 partial cards out of ~30+ on a typical search
//     page because olx.bg now hydrates its results client-side. The JSON API
//     returns the full set, structured.
//   - HTML selectors drift; JSON field names don't (or drift more slowly,
//     and break loudly).
//
// Why we still keep the scraper around: the API endpoint is undocumented and
// undeclared. If OLX disables it, the parser config can drop the `api` block
// and the scheduler falls back to HTML scraping at restart.
//
// This package shares ONE *politehttp.HostGate with the scraper — both paths
// count against the same per-host budget so we can never accidentally double
// outbound load.
package apiclient

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/Hari-Hristov/the-great-find/backend/internal/parser"
	"github.com/Hari-Hristov/the-great-find/backend/internal/politehttp"
	"github.com/Hari-Hristov/the-great-find/backend/internal/scraper"
)

// Client wraps a pluggable transport (politehttp.Doer) with politeness and
// the parser config the API speaks against. The transport is *http.Client by
// default; production may instead wire in *fetchproxy.Client to route
// requests through Electron's Chromium network stack (see
// backend/internal/fetchproxy) — the request-building and response-handling
// logic here is transport-agnostic either way.
type Client struct {
	http     politehttp.Doer
	cfg      *parser.Store
	hostGate *politehttp.HostGate
}

// NewClient builds a polite JSON client. cfg is required; if hc is nil, a
// default http.Client with a 30s overall timeout is used. If hg is nil, a
// fresh HostGate is allocated — production wires the same gate into both
// scraper and apiclient so the per-host budget covers both paths.
func NewClient(cfg *parser.Store, hc politehttp.Doer, hg *politehttp.HostGate) (*Client, error) {
	if cfg == nil {
		return nil, errors.New("apiclient: parser store is required")
	}
	current := cfg.Get()
	if current == nil || current.API == nil {
		return nil, errors.New("apiclient: parser config has no api block")
	}
	if hc == nil {
		hc = &http.Client{Timeout: 30 * time.Second}
	}
	if hg == nil {
		hg = politehttp.NewHostGate()
	}
	return &Client{http: hc, cfg: cfg, hostGate: hg}, nil
}

// BuildURL renders the full request URL from the parser config + the saved
// search's query_params JSON (same shape as scheduler.SavedSearch.QueryParams).
//
// Mirrors scheduler.buildSearchURL but writes everything as a query string —
// the API doesn't use path segments. Unknown aliases are dropped silently
// (allow-list per APIConfig.QueryParams).
//
// Special handling: if params contains a "category" key (the HTML-path slug,
// e.g. "elektronika/kompyutri/nastolni-kompyutri"), it is resolved to a numeric
// category_id via APIConfig.CategoryIDMap and emitted as the "category_id"
// alias. If no mapping exists the slug is forwarded as-is under "category_id"
// as a best-effort fallback.
func (c *Client) BuildURL(queryParamsJSON []byte) (string, error) {
	cfg := c.cfg.Get()
	if cfg == nil || cfg.API == nil {
		return "", errors.New("apiclient: parser config has no api block")
	}
	api := cfg.API

	params := map[string]string{}
	if len(queryParamsJSON) > 0 {
		if err := json.Unmarshal(queryParamsJSON, &params); err != nil {
			return "", fmt.Errorf("decode query_params: %w", err)
		}
	}

	// Resolve category slug → numeric category_id before applying defaults/allow-list.
	if slug, ok := params["category"]; ok && slug != "" {
		delete(params, "category")
		if id, mapped := api.CategoryIDMap[slug]; mapped {
			params["category_id"] = id
		} else {
			params["category_id"] = slug
		}
	}

	for alias, def := range api.QueryParamDefaults {
		if _, set := params[alias]; !set {
			params[alias] = def
		}
	}

	u, err := url.Parse(cfg.BaseURL)
	if err != nil {
		return "", fmt.Errorf("parse base_url: %w", err)
	}
	u.Path = api.ListPath

	q := u.Query()
	for alias, value := range params {
		realKey, allowed := api.QueryParams[alias]
		if !allowed || value == "" {
			continue
		}
		q.Set(realKey, value)
	}
	u.RawQuery = q.Encode()
	return u.String(), nil
}

// FetchListings fetches one page and returns the mapped listings plus the
// next-page URL if pagination has more.
func (c *Client) FetchListings(ctx context.Context, target string) ([]scraper.Listing, string, error) {
	cfg := c.cfg.Get()
	parsedURL, err := url.Parse(target)
	if err != nil {
		return nil, "", fmt.Errorf("parse url: %w", err)
	}

	if err := c.hostGate.Acquire(ctx, parsedURL.Host, cfg.Robots); err != nil {
		return nil, "", err
	}
	defer c.hostGate.Release(parsedURL.Host)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, "", fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("User-Agent", cfg.Robots.UserAgent)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "bg,en;q=0.9")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("get %s: %w", target, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("apiclient: unexpected status %d from %s", resp.StatusCode, target)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", fmt.Errorf("read body: %w", err)
	}

	listings, nextURL, err := MapOffers(body, cfg)
	if err != nil {
		return nil, "", err
	}
	return listings, nextURL, nil
}

// FetchAll walks links.next.href until the response signals no more pages
// or APIConfig.Pagination.MaxPages is reached. The cap is a runaway-loop
// backstop, not a real-world limit — if a saved search legitimately has more
// pages than this, raise it in the parser config.
func (c *Client) FetchAll(ctx context.Context, startURL string) ([]scraper.Listing, error) {
	cfg := c.cfg.Get()
	if cfg == nil || cfg.API == nil {
		return nil, errors.New("apiclient: parser config has no api block")
	}
	maxPages := cfg.API.Pagination.MaxPages
	if maxPages <= 0 {
		// Defensive — Validate() rejects this, but don't infinite-loop if a future bug slips it through.
		maxPages = 1
	}

	var all []scraper.Listing
	target := startURL
	for page := 0; page < maxPages && target != ""; page++ {
		listings, nextURL, err := c.FetchListings(ctx, target)
		if err != nil {
			return all, err
		}
		all = append(all, listings...)
		target = nextURL
	}
	return all, nil
}

// FetchListingsForSearch is the Scheduler.Fetcher implementation. Builds the
// initial URL from the saved search's query_params, then walks pagination.
func (c *Client) FetchListingsForSearch(ctx context.Context, queryParamsJSON []byte) ([]scraper.Listing, error) {
	target, err := c.BuildURL(queryParamsJSON)
	if err != nil {
		return nil, err
	}
	return c.FetchAll(ctx, target)
}
