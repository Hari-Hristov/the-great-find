package scheduler

import (
	"math"
	"testing"

	"github.com/Hari-Hristov/the-great-find/backend/internal/alerts"
	"github.com/Hari-Hristov/the-great-find/backend/internal/scraper"
)

func TestBuildAlertFiredPayload_BaseFields(t *testing.T) {
	t.Parallel()
	m := alerts.Match{
		Kind:    "new_match",
		Details: map[string]any{"reason": "first_observation"},
	}
	l := scraper.Listing{Title: "Nintendo Switch OLED", URL: "https://olx.bg/123"}

	got := buildAlertFiredPayload(42, 7, m, l)

	if got["search_id"] != int64(42) {
		t.Errorf("search_id = %v, want 42", got["search_id"])
	}
	if got["listing_id"] != int64(7) {
		t.Errorf("listing_id = %v, want 7", got["listing_id"])
	}
	if got["kind"] != "new_match" {
		t.Errorf("kind = %v, want new_match", got["kind"])
	}
	if got["title"] != "Nintendo Switch OLED" {
		t.Errorf("title = %v", got["title"])
	}
	if _, has := got["listing_price_amount"]; has {
		t.Errorf("expected no listing_price_amount when PriceAmount=nil, got %v", got["listing_price_amount"])
	}
	if _, has := got["listing_price_eur"]; has {
		t.Errorf("expected no listing_price_eur when PriceAmount=nil, got %v", got["listing_price_eur"])
	}
}

func TestBuildAlertFiredPayload_BGNPriceConvertsToEUR(t *testing.T) {
	t.Parallel()
	amount := 391.166 // exactly 200 EUR via fixed peg 1.95583
	l := scraper.Listing{
		Title:         "PS5 disc edition",
		URL:           "https://olx.bg/456",
		PriceAmount:   &amount,
		PriceCurrency: "BGN",
	}
	m := alerts.Match{Kind: "price_below", Details: map[string]any{}}

	got := buildAlertFiredPayload(1, 1, m, l)

	if v, ok := got["listing_price_amount"].(float64); !ok || v != amount {
		t.Errorf("listing_price_amount = %v, want %v", got["listing_price_amount"], amount)
	}
	if got["listing_price_currency"] != "BGN" {
		t.Errorf("listing_price_currency = %v, want BGN", got["listing_price_currency"])
	}
	eur, ok := got["listing_price_eur"].(float64)
	if !ok {
		t.Fatalf("listing_price_eur missing or wrong type: %v", got["listing_price_eur"])
	}
	const want = 200.0
	if math.Abs(eur-want) > 0.01 {
		t.Errorf("listing_price_eur = %v, want ≈ %v (BGN/1.95583)", eur, want)
	}
}

func TestBuildAlertFiredPayload_EURPriceFlowsThrough(t *testing.T) {
	t.Parallel()
	amount := 250.0
	l := scraper.Listing{
		PriceAmount:   &amount,
		PriceCurrency: "EUR",
		Title:         "x",
		URL:           "y",
	}
	got := buildAlertFiredPayload(1, 1, alerts.Match{Kind: "keyword"}, l)
	if eur, ok := got["listing_price_eur"].(float64); !ok || eur != 250.0 {
		t.Errorf("listing_price_eur = %v, want 250.0", got["listing_price_eur"])
	}
}

func TestBuildAlertFiredPayload_UnknownCurrencyOmitsEUR(t *testing.T) {
	t.Parallel()
	amount := 100.0
	l := scraper.Listing{
		PriceAmount:   &amount,
		PriceCurrency: "USD", // not handled by money.ToEUR
		Title:         "x",
		URL:           "y",
	}
	got := buildAlertFiredPayload(1, 1, alerts.Match{Kind: "keyword"}, l)
	// raw amount + currency should still surface for display
	if got["listing_price_amount"] != 100.0 {
		t.Errorf("listing_price_amount = %v, want 100.0", got["listing_price_amount"])
	}
	if got["listing_price_currency"] != "USD" {
		t.Errorf("listing_price_currency = %v, want USD", got["listing_price_currency"])
	}
	// but the EUR conversion must not — there's no fixed rate for USD.
	if _, has := got["listing_price_eur"]; has {
		t.Errorf("expected listing_price_eur absent for USD, got %v", got["listing_price_eur"])
	}
}
