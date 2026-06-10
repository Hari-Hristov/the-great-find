package apiclient

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/harihristov/the-great-find/backend/internal/parser"
	"github.com/harihristov/the-great-find/backend/internal/scraper"
)

// MapOffers parses one /api/v1/offers/ response body and returns the mapped
// listings plus the next-page URL pulled from APIConfig.Pagination.NextLinkPath.
//
// Pure function over (body, cfg) — no I/O. Tests feed it captured fixtures.
func MapOffers(raw []byte, cfg *parser.Config) ([]scraper.Listing, string, error) {
	if cfg == nil || cfg.API == nil {
		return nil, "", errors.New("apiclient: parser config has no api block")
	}
	api := cfg.API

	var root any
	if err := json.Unmarshal(raw, &root); err != nil {
		return nil, "", fmt.Errorf("decode response: %w", err)
	}

	offersAny, _ := lookupPath(root, api.Response.ListingsPath)
	offers, ok := offersAny.([]any)
	if !ok {
		// listings_path resolves but isn't an array — config drift, surface it.
		if offersAny == nil {
			return nil, extractNextURL(root, api.Pagination.NextLinkPath), nil
		}
		return nil, "", fmt.Errorf("apiclient: %q is not an array", api.Response.ListingsPath)
	}

	listings := make([]scraper.Listing, 0, len(offers))
	for _, off := range offers {
		obj, ok := off.(map[string]any)
		if !ok {
			continue
		}
		l := mapOneOffer(obj, api)
		if l.ExternalID == "" || l.URL == "" {
			// Same drop rule as the HTML scraper — junk row, don't write a half-listing.
			continue
		}
		listings = append(listings, l)
	}

	return listings, extractNextURL(root, api.Pagination.NextLinkPath), nil
}

// mapOneOffer applies the configured field mapping + price extraction to a
// single offer JSON object.
func mapOneOffer(obj map[string]any, api *parser.APIConfig) scraper.Listing {
	l := scraper.Listing{}
	for canonical, dotpath := range api.Response.Fields {
		val, ok := lookupPath(obj, dotpath)
		if !ok || val == nil {
			continue
		}
		applyAPIField(&l, canonical, val)
	}
	if amount, currency, negotiable, ok := extractPrice(obj, api.Response.PriceParamKey); ok {
		l.PriceAmount = amount
		l.PriceCurrency = currency
		l.PriceNegotiable = negotiable
	}
	return l
}

// applyAPIField writes one canonical field. Names mirror the parser-config
// `api.response.fields` keys; everything not listed here is silently ignored
// so a config can add new keys without crashing older binaries.
func applyAPIField(l *scraper.Listing, name string, value any) {
	switch name {
	case "external_id":
		l.ExternalID = stringify(value)
	case "url":
		l.URL = stringify(value)
	case "title":
		l.Title = stringify(value)
	case "description":
		l.Description = stringify(value)
	case "primary_image":
		l.PrimaryImageURL = stringify(value)
	case "city":
		l.LocationCity = stringify(value)
	case "region":
		l.LocationRegion = stringify(value)
	case "seller_name":
		l.SellerName = stringify(value)
	case "is_business":
		// Both bool and "business"/"private" string forms accepted — different
		// platforms shape this differently, the config picks the path.
		switch v := value.(type) {
		case bool:
			if v {
				l.SellerType = "business"
			} else {
				l.SellerType = "private"
			}
		case string:
			l.SellerType = v
		}
	case "created_time":
		l.PostedAtRaw = stringify(value)
	}
}

// extractPrice walks params[] and reads value.value + value.currency from the
// element whose key matches priceKey. Returns ok=false if the params list is
// missing, the entry isn't found, or the value object is malformed — callers
// should treat ok=false as "price unknown" (zero values).
func extractPrice(obj map[string]any, priceKey string) (*float64, string, bool, bool) {
	paramsAny, ok := obj["params"]
	if !ok {
		return nil, "", false, false
	}
	params, ok := paramsAny.([]any)
	if !ok {
		return nil, "", false, false
	}
	for _, p := range params {
		pm, ok := p.(map[string]any)
		if !ok {
			continue
		}
		if k, _ := pm["key"].(string); k != priceKey {
			continue
		}
		valAny, ok := pm["value"].(map[string]any)
		if !ok {
			return nil, "", false, false
		}
		amount := toFloatPtr(valAny["value"])
		currency, _ := valAny["currency"].(string)
		negotiable, _ := valAny["negotiable"].(bool)
		return amount, currency, negotiable, true
	}
	return nil, "", false, false
}

// extractNextURL pulls a single string from the response by dot-path.
// Returns "" when the path is empty, missing, or not a string.
func extractNextURL(root any, dotpath string) string {
	if dotpath == "" {
		return ""
	}
	v, ok := lookupPath(root, dotpath)
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}

// lookupPath walks a dot-separated path through a JSON-decoded value.
//
// Strings traverse map keys; integers (literally "0", "1", ...) traverse
// array indices. Returns ok=false if any segment misses or the path runs off
// a leaf. Empty path → returns root, ok=true.
func lookupPath(root any, path string) (any, bool) {
	if path == "" {
		return root, true
	}
	cur := root
	for _, seg := range strings.Split(path, ".") {
		if cur == nil {
			return nil, false
		}
		switch node := cur.(type) {
		case map[string]any:
			next, ok := node[seg]
			if !ok {
				return nil, false
			}
			cur = next
		case []any:
			idx, err := strconv.Atoi(seg)
			if err != nil || idx < 0 || idx >= len(node) {
				return nil, false
			}
			cur = node[idx]
		default:
			return nil, false
		}
	}
	return cur, true
}

// stringify coerces the assorted JSON-decoded types into a string. Booleans
// and numbers go through fmt verbs; nil → "". Anything weirder → "" (silently
// dropped — same "treat empty as unknown" contract as scraper.Listing).
func stringify(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case float64:
		// json.Unmarshal turns numbers into float64. If the int form survives
		// to here it's an id, so render without trailing decimals.
		if x == float64(int64(x)) {
			return strconv.FormatInt(int64(x), 10)
		}
		return strconv.FormatFloat(x, 'f', -1, 64)
	case bool:
		if x {
			return "true"
		}
		return "false"
	case nil:
		return ""
	default:
		return ""
	}
}

// toFloatPtr accepts the assorted JSON number forms and returns *float64.
// nil / non-numeric → nil (price is optional on negotiable listings).
func toFloatPtr(v any) *float64 {
	switch x := v.(type) {
	case float64:
		f := x
		return &f
	case json.Number:
		if f, err := x.Float64(); err == nil {
			return &f
		}
	case string:
		if f, err := strconv.ParseFloat(x, 64); err == nil {
			return &f
		}
	}
	return nil
}
