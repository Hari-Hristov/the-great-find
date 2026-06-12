// Package alerts evaluates saved-search alert criteria against listing observations.
//
// A saved_searches row carries a JSON `alert_criteria` blob describing one or
// more rules. On every poll the scheduler:
//
//   1. Decodes alert_criteria into a Spec.
//   2. For each new or updated listing the poll produced, calls Spec.Evaluate
//      against the listing snapshot + recent price history.
//   3. For each Match returned, INSERT OR IGNOREs an alerts_sent row keyed by
//      (search_id, listing_id, criteria_hash). The unique constraint dedupes
//      across polls — the same listing+rule will not double-fire.
//
// Three rule kinds are supported:
//
//   - new_match    — fires on the first observation of a listing under this search.
//   - keyword      — fires when the listing's title/description contains any of
//                    the configured terms (case-folded substring match).
//   - price_drop   — fires when the latest price (in EUR) is at least PercentMin
//                    or AbsoluteEUR cheaper than the previous observation.
//
// Each rule produces a deterministic CriteriaHash so dedup works across restarts.
package alerts

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Hari-Hristov/the-great-find/backend/internal/money"
)

// Listing is the minimum surface the rules need from a scraped listing.
// Defined here (not pulling in scraper.Listing) to keep the package decoupled.
type Listing struct {
	ID            int64
	Title         string
	Description   string
	PriceAmount   *float64
	PriceCurrency string
	IsNew         bool // first time seen under this search
}

// PriceHistory is the minimum the rules need to evaluate a drop.
//
// Entries are ordered newest-first. The first entry is the price the rule will
// compare against; older entries supply the baseline.
type PriceHistory struct {
	Amount   *float64
	Currency string
}

// Spec is the decoded shape of saved_searches.alert_criteria.
//
// Any combination of rules can be set. Unset rules are no-ops.
type Spec struct {
	NewMatch   *NewMatchRule   `json:"new_match,omitempty"`
	Keyword    *KeywordRule    `json:"keyword,omitempty"`
	PriceDrop  *PriceDropRule  `json:"price_drop,omitempty"`
	PriceBelow *PriceBelowRule `json:"price_below,omitempty"`
}

// NewMatchRule fires once when a listing is first observed under this search.
// It carries no parameters — the existence of the field is the rule.
type NewMatchRule struct{}

// KeywordRule fires when any of Terms appears (case-fold substring) in any of
// Fields. Fields defaults to ["title","description"] when empty.
type KeywordRule struct {
	Terms  []string `json:"terms"`
	Fields []string `json:"fields,omitempty"`
}

// PriceDropRule fires when the latest EUR price is cheaper than the previous
// observation by at least PercentMin (e.g. 0.10 = 10%) OR by at least
// AbsoluteEUR. Either threshold is sufficient (OR semantics) — both can be set,
// neither cannot.
type PriceDropRule struct {
	PercentMin  float64 `json:"percent_min,omitempty"`
	AbsoluteEUR float64 `json:"absolute_eur,omitempty"`
}

// PriceBelowRule fires when a listing's current EUR price is at or below
// ThresholdEUR. The criteria_hash dedup in alerts_sent prevents it from
// re-firing on the same listing while the price stays below the threshold;
// if the price rises above and then drops below again, the hash changes
// because the stored criteria JSON embeds the current price, so it re-fires.
type PriceBelowRule struct {
	ThresholdEUR float64 `json:"price_eur"`
}

// Match is a fired alert ready to insert into alerts_sent.
type Match struct {
	Kind          string         // "new_match" | "keyword" | "price_drop"
	CriteriaHash  string         // dedup key for alerts_sent UNIQUE constraint
	CriteriaJSON  string         // human-readable JSON for the alerts_sent.criteria column
	Details       map[string]any // for the SSE event payload
}

// Decode parses a JSON spec from saved_searches.alert_criteria. A nil/empty
// blob is treated as "no rules configured" and yields a zero Spec — every
// Evaluate call against it returns no matches.
//
// Two formats are accepted:
//
//   - Nested (canonical): {"price_below":{"price_eur":220},"new_match":{}}
//   - Flat legacy (written by the frontend EditForm): {"kind":"price_below","price_eur":220}
//
// The flat format is auto-promoted to the nested canonical shape.
func Decode(raw []byte) (Spec, error) {
	if len(raw) == 0 {
		return Spec{}, nil
	}

	// Peek at whether this is a flat {"kind":"...","price_eur":...} object.
	var flat struct {
		Kind         string  `json:"kind"`
		PriceEUR     float64 `json:"price_eur"`
	}
	if err := json.Unmarshal(raw, &flat); err != nil {
		return Spec{}, fmt.Errorf("decode alert_criteria: %w", err)
	}
	if flat.Kind != "" {
		return promoteFlatSpec(flat.Kind, flat.PriceEUR)
	}

	var s Spec
	if err := json.Unmarshal(raw, &s); err != nil {
		return Spec{}, fmt.Errorf("decode alert_criteria: %w", err)
	}
	return s, nil
}

// promoteFlatSpec converts the frontend's flat {"kind":"price_below","price_eur":220}
// format into a canonical Spec.
func promoteFlatSpec(kind string, priceEUR float64) (Spec, error) {
	switch kind {
	case "price_below":
		if priceEUR <= 0 {
			return Spec{}, fmt.Errorf("decode alert_criteria: price_below requires positive price_eur")
		}
		return Spec{PriceBelow: &PriceBelowRule{ThresholdEUR: priceEUR}}, nil
	case "new_match":
		return Spec{NewMatch: &NewMatchRule{}}, nil
	default:
		return Spec{}, fmt.Errorf("decode alert_criteria: unknown flat kind %q", kind)
	}
}

// Evaluate runs all configured rules against the listing snapshot.
//
// history is the listing's recent price observations, newest-first. Pass nil
// when no prior history exists (e.g. for a freshly-inserted listing); the
// price-drop rule will simply not fire.
func (s Spec) Evaluate(l Listing, history []PriceHistory) []Match {
	var matches []Match
	if s.NewMatch != nil && l.IsNew {
		matches = append(matches, newMatchMatch())
	}
	if s.Keyword != nil {
		if m, ok := s.Keyword.evaluate(l); ok {
			matches = append(matches, m)
		}
	}
	if s.PriceDrop != nil {
		if m, ok := s.PriceDrop.evaluate(l, history); ok {
			matches = append(matches, m)
		}
	}
	if s.PriceBelow != nil {
		if m, ok := s.PriceBelow.evaluate(l); ok {
			matches = append(matches, m)
		}
	}
	return matches
}

func newMatchMatch() Match {
	return Match{
		Kind:         "new_match",
		CriteriaHash: hashCriteria("new_match", nil),
		CriteriaJSON: `{"kind":"new_match"}`,
		Details:      map[string]any{"kind": "new_match"},
	}
}

func (k *KeywordRule) evaluate(l Listing) (Match, bool) {
	fields := k.Fields
	if len(fields) == 0 {
		fields = []string{"title", "description"}
	}
	haystack := strings.ToLower(joinFields(l, fields))
	for _, term := range k.Terms {
		t := strings.ToLower(strings.TrimSpace(term))
		if t == "" {
			continue
		}
		if strings.Contains(haystack, t) {
			return Match{
				Kind:         "keyword",
				CriteriaHash: hashCriteria("keyword", k),
				CriteriaJSON: mustJSON(map[string]any{"kind": "keyword", "terms": k.Terms, "fields": fields, "matched": term}),
				Details:      map[string]any{"kind": "keyword", "matched": term},
			}, true
		}
	}
	return Match{}, false
}

func (p *PriceDropRule) evaluate(l Listing, history []PriceHistory) (Match, bool) {
	if l.PriceAmount == nil || len(history) < 2 {
		return Match{}, false
	}
	currentEUR, ok := money.ToEUR(*l.PriceAmount, l.PriceCurrency)
	if !ok {
		return Match{}, false
	}
	// history[0] is the just-stored current observation; history[1] is the prior.
	prior := history[1]
	if prior.Amount == nil {
		return Match{}, false
	}
	priorEUR, ok := money.ToEUR(*prior.Amount, prior.Currency)
	if !ok || priorEUR <= 0 {
		return Match{}, false
	}
	if currentEUR >= priorEUR {
		return Match{}, false
	}
	dropAbs := priorEUR - currentEUR
	dropPct := dropAbs / priorEUR

	pctOK := p.PercentMin > 0 && dropPct >= p.PercentMin
	absOK := p.AbsoluteEUR > 0 && dropAbs >= p.AbsoluteEUR
	if !pctOK && !absOK {
		return Match{}, false
	}
	return Match{
		Kind:         "price_drop",
		CriteriaHash: hashCriteria("price_drop", p),
		CriteriaJSON: mustJSON(map[string]any{
			"kind":         "price_drop",
			"percent_min":  p.PercentMin,
			"absolute_eur": p.AbsoluteEUR,
			"prior_eur":    priorEUR,
			"current_eur":  currentEUR,
		}),
		Details: map[string]any{
			"kind":         "price_drop",
			"prior_eur":    priorEUR,
			"current_eur":  currentEUR,
			"drop_eur":     dropAbs,
			"drop_percent": dropPct,
		},
	}, true
}

func (p *PriceBelowRule) evaluate(l Listing) (Match, bool) {
	if l.PriceAmount == nil {
		return Match{}, false
	}
	currentEUR, ok := money.ToEUR(*l.PriceAmount, l.PriceCurrency)
	if !ok {
		return Match{}, false
	}
	if currentEUR > p.ThresholdEUR {
		return Match{}, false
	}
	return Match{
		Kind:         "price_below",
		CriteriaHash: hashCriteria("price_below", p),
		CriteriaJSON: mustJSON(map[string]any{
			"kind":          "price_below",
			"price_eur":     p.ThresholdEUR,
			"current_eur":   currentEUR,
		}),
		Details: map[string]any{
			"kind":        "price_below",
			"threshold":   p.ThresholdEUR,
			"current_eur": currentEUR,
		},
	}, true
}

func joinFields(l Listing, fields []string) string {
	var parts []string
	for _, f := range fields {
		switch f {
		case "title":
			parts = append(parts, l.Title)
		case "description":
			parts = append(parts, l.Description)
		}
	}
	return strings.Join(parts, "\n")
}

// hashCriteria produces a stable short hex digest the alerts_sent UNIQUE
// constraint can dedup on. We hash the kind + the canonical JSON of the rule
// params so a parameter change creates a different hash (and can fire fresh).
func hashCriteria(kind string, rule any) string {
	canonical, _ := json.Marshal(rule)
	h := sha256.Sum256([]byte(kind + ":" + string(canonical)))
	return hex.EncodeToString(h[:16])
}

func mustJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}
