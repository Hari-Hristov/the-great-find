package alerts

import (
	"strings"
	"testing"
)

func ptr(f float64) *float64 { return &f }

func TestEvaluate_NewMatchFiresOnFirstSighting(t *testing.T) {
	spec := Spec{NewMatch: &NewMatchRule{}}
	matches := spec.Evaluate(Listing{IsNew: true}, nil)
	if len(matches) != 1 || matches[0].Kind != "new_match" {
		t.Fatalf("got %+v", matches)
	}
}

func TestEvaluate_NewMatchSkipsExistingListing(t *testing.T) {
	spec := Spec{NewMatch: &NewMatchRule{}}
	matches := spec.Evaluate(Listing{IsNew: false}, nil)
	if len(matches) != 0 {
		t.Fatalf("got %+v, want none", matches)
	}
}

func TestEvaluate_KeywordCaseFold(t *testing.T) {
	spec := Spec{Keyword: &KeywordRule{Terms: []string{"iPhone", "Galaxy"}}}
	matches := spec.Evaluate(Listing{Title: "продавам iphone 15 pro max"}, nil)
	if len(matches) != 1 || matches[0].Kind != "keyword" {
		t.Fatalf("got %+v", matches)
	}
	if !strings.Contains(matches[0].CriteriaJSON, "matched") {
		t.Errorf("expected matched term in criteria JSON: %s", matches[0].CriteriaJSON)
	}
}

func TestEvaluate_KeywordNoMatch(t *testing.T) {
	spec := Spec{Keyword: &KeywordRule{Terms: []string{"Pixel"}}}
	matches := spec.Evaluate(Listing{Title: "iPhone 15", Description: "rare condition"}, nil)
	if len(matches) != 0 {
		t.Fatalf("got %+v", matches)
	}
}

func TestEvaluate_KeywordSearchesDescription(t *testing.T) {
	spec := Spec{Keyword: &KeywordRule{Terms: []string{"гаранция"}}}
	matches := spec.Evaluate(Listing{Title: "iPhone 15", Description: "ОФИЦИАЛНА гаранция от вносителя"}, nil)
	if len(matches) != 1 {
		t.Fatalf("expected description match, got %+v", matches)
	}
}

func TestEvaluate_KeywordHonorsRestrictedFields(t *testing.T) {
	spec := Spec{Keyword: &KeywordRule{Terms: []string{"гаранция"}, Fields: []string{"title"}}}
	matches := spec.Evaluate(Listing{Title: "iPhone 15", Description: "с гаранция"}, nil)
	if len(matches) != 0 {
		t.Fatalf("description should not match when fields=[title]: %+v", matches)
	}
}

func TestEvaluate_PriceDropFiresOnPercentDrop(t *testing.T) {
	spec := Spec{PriceDrop: &PriceDropRule{PercentMin: 0.10}}
	listing := Listing{PriceAmount: ptr(900), PriceCurrency: "EUR"}
	history := []PriceHistory{
		{Amount: ptr(900), Currency: "EUR"}, // current
		{Amount: ptr(1000), Currency: "EUR"}, // prior — 10% drop exactly
	}
	matches := spec.Evaluate(listing, history)
	if len(matches) != 1 || matches[0].Kind != "price_drop" {
		t.Fatalf("got %+v", matches)
	}
}

func TestEvaluate_PriceDropFiresOnAbsoluteDrop(t *testing.T) {
	spec := Spec{PriceDrop: &PriceDropRule{AbsoluteEUR: 100}}
	listing := Listing{PriceAmount: ptr(950), PriceCurrency: "EUR"}
	history := []PriceHistory{
		{Amount: ptr(950), Currency: "EUR"},
		{Amount: ptr(1100), Currency: "EUR"}, // 150 EUR drop
	}
	matches := spec.Evaluate(listing, history)
	if len(matches) != 1 {
		t.Fatalf("got %+v", matches)
	}
}

func TestEvaluate_PriceDropDoesNotFireBelowThresholds(t *testing.T) {
	spec := Spec{PriceDrop: &PriceDropRule{PercentMin: 0.20, AbsoluteEUR: 500}}
	listing := Listing{PriceAmount: ptr(950), PriceCurrency: "EUR"}
	history := []PriceHistory{
		{Amount: ptr(950), Currency: "EUR"},
		{Amount: ptr(1000), Currency: "EUR"}, // only 5%, only 50 EUR
	}
	matches := spec.Evaluate(listing, history)
	if len(matches) != 0 {
		t.Fatalf("expected no fire, got %+v", matches)
	}
}

func TestEvaluate_PriceDropConvertsBGNtoEUR(t *testing.T) {
	spec := Spec{PriceDrop: &PriceDropRule{PercentMin: 0.10}}
	// Current 900 EUR, prior 1955.83 BGN = 1000 EUR. Drop = 10%.
	listing := Listing{PriceAmount: ptr(900), PriceCurrency: "EUR"}
	history := []PriceHistory{
		{Amount: ptr(900), Currency: "EUR"},
		{Amount: ptr(1955.83), Currency: "BGN"},
	}
	matches := spec.Evaluate(listing, history)
	if len(matches) != 1 {
		t.Fatalf("BGN-priced prior should normalize to EUR: %+v", matches)
	}
}

func TestEvaluate_PriceDropSkipsWhenHistoryIncomplete(t *testing.T) {
	spec := Spec{PriceDrop: &PriceDropRule{PercentMin: 0.10}}
	matches := spec.Evaluate(Listing{PriceAmount: ptr(100), PriceCurrency: "EUR"}, nil)
	if len(matches) != 0 {
		t.Fatalf("no history → no fire, got %+v", matches)
	}
	// Only one observation = no prior to compare.
	matches = spec.Evaluate(Listing{PriceAmount: ptr(100), PriceCurrency: "EUR"}, []PriceHistory{{Amount: ptr(100), Currency: "EUR"}})
	if len(matches) != 0 {
		t.Fatalf("single observation → no fire, got %+v", matches)
	}
}

func TestEvaluate_PriceDropDoesNotFireWhenPriceUp(t *testing.T) {
	spec := Spec{PriceDrop: &PriceDropRule{PercentMin: 0.10}}
	listing := Listing{PriceAmount: ptr(1100), PriceCurrency: "EUR"}
	history := []PriceHistory{
		{Amount: ptr(1100), Currency: "EUR"},
		{Amount: ptr(1000), Currency: "EUR"},
	}
	matches := spec.Evaluate(listing, history)
	if len(matches) != 0 {
		t.Fatalf("price went up, must not fire: %+v", matches)
	}
}

func TestEvaluate_AllRulesCanFireOnSameListing(t *testing.T) {
	spec := Spec{
		NewMatch:  &NewMatchRule{},
		Keyword:   &KeywordRule{Terms: []string{"iPhone"}},
		PriceDrop: &PriceDropRule{PercentMin: 0.05},
	}
	listing := Listing{
		IsNew:         true,
		Title:         "iPhone 15",
		PriceAmount:   ptr(900),
		PriceCurrency: "EUR",
	}
	history := []PriceHistory{
		{Amount: ptr(900), Currency: "EUR"},
		{Amount: ptr(1000), Currency: "EUR"},
	}
	matches := spec.Evaluate(listing, history)
	if len(matches) != 3 {
		t.Fatalf("expected all three rules to fire, got %+v", matches)
	}
}

func TestDecode_HandlesEmpty(t *testing.T) {
	for _, raw := range [][]byte{nil, {}, []byte("")} {
		spec, err := Decode(raw)
		if err != nil {
			t.Errorf("Decode(%q): %v", raw, err)
		}
		if spec.NewMatch != nil || spec.Keyword != nil || spec.PriceDrop != nil {
			t.Errorf("Decode(%q) should be zero spec, got %+v", raw, spec)
		}
	}
}

func TestDecode_RejectsGarbage(t *testing.T) {
	if _, err := Decode([]byte("not json")); err == nil {
		t.Fatal("expected error on bad JSON")
	}
}

func TestDecode_RoundTrips(t *testing.T) {
	raw := []byte(`{
		"new_match": {},
		"keyword": {"terms": ["iphone"]},
		"price_drop": {"percent_min": 0.1}
	}`)
	spec, err := Decode(raw)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	if spec.NewMatch == nil || spec.Keyword == nil || spec.PriceDrop == nil {
		t.Fatalf("expected all three rules: %+v", spec)
	}
}

func TestHashCriteria_Stable(t *testing.T) {
	a := hashCriteria("keyword", &KeywordRule{Terms: []string{"a", "b"}})
	b := hashCriteria("keyword", &KeywordRule{Terms: []string{"a", "b"}})
	if a != b {
		t.Errorf("hash should be stable for equal inputs: %s vs %s", a, b)
	}
	c := hashCriteria("keyword", &KeywordRule{Terms: []string{"a", "c"}})
	if a == c {
		t.Errorf("hash should differ for different inputs")
	}
}
