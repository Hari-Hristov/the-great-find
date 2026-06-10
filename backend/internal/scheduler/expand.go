package scheduler

import (
	"encoding/json"
	"fmt"

	"github.com/harihristov/the-great-find/backend/internal/apiclient"
	"github.com/harihristov/the-great-find/backend/internal/scraper"
)

// expandQueryParams produces one query_params JSON per keyword variant the
// poll should fan out over. The list always starts with the unmodified
// original; subsequent entries are built-in transliterations
// (apiclient.ExpandKeyword) plus any user-supplied keyword_variants.
//
// The keyword_variants key is stripped from every emitted JSON so the
// downstream apiclient allow-list never sees it. Saved searches without a
// keyword (filter-only searches) yield a single entry equal to the input.
func expandQueryParams(raw []byte) ([][]byte, error) {
	if len(raw) == 0 {
		return [][]byte{raw}, nil
	}

	var params map[string]any
	if err := json.Unmarshal(raw, &params); err != nil {
		return nil, fmt.Errorf("decode query_params: %w", err)
	}

	userVariants := popKeywordVariants(params)
	keyword, _ := params["keyword"].(string)

	variants := []string{}
	if keyword != "" {
		variants = append(variants, apiclient.ExpandKeyword(keyword)...)
	}
	variants = appendUnique(variants, userVariants...)

	if len(variants) == 0 {
		// Filter-only search (no keyword, no variants) — emit the cleaned JSON
		// once so the fetcher still runs.
		stripped, err := json.Marshal(params)
		if err != nil {
			return nil, fmt.Errorf("re-encode query_params: %w", err)
		}
		return [][]byte{stripped}, nil
	}

	out := make([][]byte, 0, len(variants))
	for _, v := range variants {
		params["keyword"] = v
		encoded, err := json.Marshal(params)
		if err != nil {
			return nil, fmt.Errorf("re-encode query_params: %w", err)
		}
		out = append(out, encoded)
	}
	return out, nil
}

// popKeywordVariants pulls the optional "keyword_variants" array out of the
// decoded params and returns it as []string. Anything that isn't an array of
// strings is silently dropped — saved-search JSON is freeform and we don't
// fail polling over a typo.
func popKeywordVariants(params map[string]any) []string {
	rawList, ok := params["keyword_variants"]
	delete(params, "keyword_variants")
	if !ok {
		return nil
	}
	asSlice, ok := rawList.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(asSlice))
	for _, v := range asSlice {
		if s, ok := v.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

// appendUnique appends candidates to base, skipping any that already appear.
// Order is preserved — first occurrence wins.
func appendUnique(base []string, candidates ...string) []string {
	seen := make(map[string]struct{}, len(base)+len(candidates))
	for _, s := range base {
		seen[s] = struct{}{}
	}
	for _, s := range candidates {
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		base = append(base, s)
	}
	return base
}

// dedupeListingsByExternalID returns the input slice with duplicate
// ExternalID entries removed; the first occurrence wins. Used to fold
// fan-out results before feeding the upsert pipeline.
func dedupeListingsByExternalID(in []scraper.Listing) []scraper.Listing {
	if len(in) <= 1 {
		return in
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]scraper.Listing, 0, len(in))
	for _, l := range in {
		if l.ExternalID == "" {
			out = append(out, l)
			continue
		}
		if _, ok := seen[l.ExternalID]; ok {
			continue
		}
		seen[l.ExternalID] = struct{}{}
		out = append(out, l)
	}
	return out
}
