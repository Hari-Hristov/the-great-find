package scraper

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"

	"github.com/Hari-Hristov/the-great-find/backend/internal/parser"
)

// fieldValue is the union of values an extractor can return.
//
// The grid/detail apply functions decide which kind they expect based on the
// field name; this struct just keeps both possibilities together so we don't
// need parallel maps.
type fieldValue struct {
	str  string
	bool bool
	list []string
}

// extractField runs one FieldExtract against a node. Returns (value, true) when
// the selector matched and the requested attribute was non-empty.
//
// fx.Absolute resolves href/src against baseURL (relative URLs are common on olx.bg).
func extractField(root *goquery.Selection, fx parser.FieldExtract, baseURL string) (fieldValue, bool) {
	matched := root.Find(fx.Selector)
	if matched.Length() == 0 {
		return fieldValue{}, false
	}

	switch fx.Attr {
	case "exists":
		return fieldValue{bool: true}, true
	case "text":
		text := strings.TrimSpace(matched.First().Text())
		if text == "" {
			return fieldValue{}, false
		}
		return fieldValue{str: text}, true
	case "list":
		var out []string
		matched.Each(func(_ int, s *goquery.Selection) {
			t := strings.TrimSpace(s.Text())
			if t != "" {
				out = append(out, t)
			}
		})
		if len(out) == 0 {
			return fieldValue{}, false
		}
		return fieldValue{list: out}, true
	case "src-list":
		var out []string
		matched.Each(func(_ int, s *goquery.Selection) {
			if v, ok := s.Attr("src"); ok && v != "" {
				out = append(out, resolve(baseURL, v, fx.Absolute))
			}
		})
		if len(out) == 0 {
			return fieldValue{}, false
		}
		return fieldValue{list: out}, true
	default:
		// Treat anything else as an attribute name (href, src, id, ...).
		v, ok := matched.First().Attr(fx.Attr)
		if !ok || v == "" {
			return fieldValue{}, false
		}
		return fieldValue{str: resolve(baseURL, v, fx.Absolute)}, true
	}
}

// resolve absolutizes a URL against baseURL when absolute is requested. Returns
// the input unchanged if either URL fails to parse — better to keep something
// than to drop the listing.
func resolve(baseURL, ref string, absolute bool) string {
	if !absolute {
		return ref
	}
	base, err := url.Parse(baseURL)
	if err != nil {
		return ref
	}
	r, err := url.Parse(ref)
	if err != nil {
		return ref
	}
	return base.ResolveReference(r).String()
}

// applyField writes a grid-extracted value onto Listing. Field names match the
// keys in parser-config/olx-bg.json's grid.fields. Unknown names are ignored
// so adding new selectors to the JSON config doesn't crash old binaries.
func applyField(l *Listing, name string, v fieldValue) {
	switch name {
	case "external_id":
		// The id attribute on olx.bg cards has the form "ad-1234567" — keep just the number
		// so it's a stable join key across repolls.
		l.ExternalID = stripIDPrefix(v.str)
	case "url":
		l.URL = v.str
	case "title":
		l.Title = v.str
	case "price":
		amount, currency, negotiable := parsePrice(v.str)
		if amount != nil {
			l.PriceAmount = amount
			l.PriceCurrency = currency
		}
		l.PriceNegotiable = negotiable
	case "location_posted":
		// olx.bg renders "<city> - <relative-time>" in one element — split it.
		city, raw := splitLocationPosted(v.str)
		l.LocationCity = city
		l.PostedAtRaw = raw
	case "primary_image_url":
		l.PrimaryImageURL = v.str
	case "promoted_top":
		l.PromotedTop = v.bool
	}
}

// applyDetailField handles fields that come from the detail page.
func applyDetailField(l *Listing, name string, v fieldValue) {
	switch name {
	case "description":
		if v.str != "" {
			l.Description = v.str
		}
	case "posted_at":
		if v.str != "" {
			l.PostedAtRaw = v.str
		}
	case "seller_name":
		if v.str != "" {
			l.SellerName = v.str
		}
	case "seller_type":
		if v.str != "" {
			l.SellerType = strings.ToLower(v.str)
		}
	case "params_block":
		// Each "li" on olx.bg renders as "Key: Value". Split on the first colon.
		for _, raw := range v.list {
			k, val, ok := strings.Cut(raw, ":")
			if !ok {
				continue
			}
			k = strings.TrimSpace(k)
			val = strings.TrimSpace(val)
			if k != "" {
				if l.Params == nil {
					l.Params = map[string]string{}
				}
				l.Params[k] = val
			}
		}
	case "photos":
		l.Photos = append(l.Photos, v.list...)
	}
}

// stripIDPrefix turns "ad-1234567" or "card-9876" into "1234567"/"9876". Falls back
// to the raw value if no recognized prefix is present.
var idPrefixRE = regexp.MustCompile(`^(?:ad|card|listing)-(.+)$`)

func stripIDPrefix(raw string) string {
	if m := idPrefixRE.FindStringSubmatch(raw); m != nil {
		return m[1]
	}
	return raw
}

// parsePrice extracts (amount, currency, negotiable) from olx.bg's price strings.
//
// Examples:
//
//	"1 200 лв." → (1200, "BGN", false)
//	"600 EUR"   → (600, "EUR", false)
//	"По договаряне" / "Negotiable" → (nil, "", true)
//	""          → (nil, "", false)
func parsePrice(raw string) (*float64, string, bool) {
	if raw == "" {
		return nil, "", false
	}
	low := strings.ToLower(raw)
	if strings.Contains(low, "договар") || strings.Contains(low, "negotiable") || strings.Contains(low, "по договаряне") {
		return nil, "", true
	}

	currency := detectCurrency(low)

	// Strip everything that isn't a digit or a decimal separator.
	cleaned := strings.Map(func(r rune) rune {
		switch {
		case r >= '0' && r <= '9':
			return r
		case r == '.' || r == ',':
			return r
		default:
			return -1
		}
	}, raw)
	cleaned = strings.ReplaceAll(cleaned, ",", ".")
	// Multiple dots from "1.200.50" type strings — keep only the last as the decimal.
	if cnt := strings.Count(cleaned, "."); cnt > 1 {
		idx := strings.LastIndex(cleaned, ".")
		cleaned = strings.ReplaceAll(cleaned[:idx], ".", "") + cleaned[idx:]
	}
	if cleaned == "" {
		return nil, currency, false
	}
	amount, err := strconv.ParseFloat(cleaned, 64)
	if err != nil {
		return nil, currency, false
	}
	return &amount, currency, false
}

func detectCurrency(low string) string {
	switch {
	case strings.Contains(low, "лв") || strings.Contains(low, "bgn"):
		return "BGN"
	case strings.Contains(low, "eur") || strings.Contains(low, "€"):
		return "EUR"
	case strings.Contains(low, "usd") || strings.Contains(low, "$"):
		return "USD"
	default:
		return ""
	}
}

// splitLocationPosted breaks "Sofia - today at 14:32" into ("Sofia", "today at 14:32").
// olx.bg uses " - " (with surrounding spaces) and occasionally " — ".
func splitLocationPosted(raw string) (city, posted string) {
	for _, sep := range []string{" - ", " — ", " – "} {
		if i := strings.Index(raw, sep); i > -1 {
			return strings.TrimSpace(raw[:i]), strings.TrimSpace(raw[i+len(sep):])
		}
	}
	return strings.TrimSpace(raw), ""
}
