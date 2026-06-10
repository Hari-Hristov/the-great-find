package apiclient

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/harihristov/the-great-find/backend/internal/parser"
)

// loadConfig pulls the embedded olx-bg.json so the mapper tests run against
// the same field-mapping the production binary uses.
func loadConfig(t *testing.T) *parser.Config {
	t.Helper()
	cfg, err := parser.EmbeddedOLXBG()
	if err != nil {
		t.Fatalf("load embedded parser config: %v", err)
	}
	if cfg.API == nil {
		t.Fatal("embedded config has no api block; mapper tests need v3")
	}
	return cfg
}

func loadFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return data
}

func TestMapOffers_HappyPath(t *testing.T) {
	cfg := loadConfig(t)
	body := loadFixture(t, "offers_sample.json")

	listings, nextURL, err := MapOffers(body, cfg)
	if err != nil {
		t.Fatalf("MapOffers: %v", err)
	}

	// Junk row (missing URL) is dropped → 4 input → 3 output.
	if len(listings) != 3 {
		t.Fatalf("got %d listings, want 3 (junk row should drop)", len(listings))
	}

	first := listings[0]
	if first.ExternalID != "1234567" {
		t.Errorf("ExternalID = %q, want %q", first.ExternalID, "1234567")
	}
	if first.Title != "iPhone 15 Pro 256GB" {
		t.Errorf("Title = %q", first.Title)
	}
	if first.Description != "Mint condition, full box." {
		t.Errorf("Description = %q", first.Description)
	}
	if first.PriceAmount == nil || *first.PriceAmount != 1100.00 {
		t.Errorf("PriceAmount = %v, want 1100.00", first.PriceAmount)
	}
	if first.PriceCurrency != "EUR" {
		t.Errorf("PriceCurrency = %q", first.PriceCurrency)
	}
	if first.PriceNegotiable {
		t.Error("PriceNegotiable should be false")
	}
	if first.LocationCity != "София" {
		t.Errorf("LocationCity = %q", first.LocationCity)
	}
	if first.LocationRegion != "Област София-град" {
		t.Errorf("LocationRegion = %q", first.LocationRegion)
	}
	if first.SellerName != "Иван П." {
		t.Errorf("SellerName = %q", first.SellerName)
	}
	if first.SellerType != "private" {
		t.Errorf("SellerType = %q, want private", first.SellerType)
	}
	if first.PrimaryImageURL != "https://apollo.olx.bg/v1/files/abc-BG/image" {
		t.Errorf("PrimaryImageURL = %q", first.PrimaryImageURL)
	}
	if first.PostedAtRaw != "2026-06-09T14:32:00+03:00" {
		t.Errorf("PostedAtRaw = %q", first.PostedAtRaw)
	}

	if nextURL == "" {
		t.Fatal("nextURL is empty; expected pagination link")
	}
	if nextURL != "https://www.olx.bg/api/v1/offers/?offset=40&limit=40&sort_by=created_at%3Adesc" {
		t.Errorf("nextURL = %q", nextURL)
	}
}

func TestMapOffers_BusinessSeller(t *testing.T) {
	cfg := loadConfig(t)
	body := loadFixture(t, "offers_sample.json")

	listings, _, err := MapOffers(body, cfg)
	if err != nil {
		t.Fatalf("MapOffers: %v", err)
	}
	// Second listing is business: true with a BGN price.
	biz := listings[1]
	if biz.SellerType != "business" {
		t.Errorf("SellerType = %q, want business", biz.SellerType)
	}
	if biz.PriceCurrency != "BGN" {
		t.Errorf("PriceCurrency = %q, want BGN", biz.PriceCurrency)
	}
	if !biz.PriceNegotiable {
		t.Error("PriceNegotiable should be true (negotiable=true in fixture)")
	}
	if biz.PriceAmount == nil || *biz.PriceAmount != 50.0 {
		t.Errorf("PriceAmount = %v, want 50", biz.PriceAmount)
	}
}

func TestMapOffers_MissingPriceParam(t *testing.T) {
	cfg := loadConfig(t)
	body := loadFixture(t, "offers_sample.json")

	listings, _, err := MapOffers(body, cfg)
	if err != nil {
		t.Fatalf("MapOffers: %v", err)
	}
	// Third surviving listing has empty params — price extraction should miss cleanly.
	noPrice := listings[2]
	if noPrice.ExternalID != "8888888" {
		t.Fatalf("unexpected listing order: got id=%q", noPrice.ExternalID)
	}
	if noPrice.PriceAmount != nil {
		t.Errorf("PriceAmount should be nil when params is empty, got %v", noPrice.PriceAmount)
	}
	if noPrice.PriceCurrency != "" {
		t.Errorf("PriceCurrency should be empty, got %q", noPrice.PriceCurrency)
	}
	// Other fields still populated.
	if noPrice.Title == "" || noPrice.PrimaryImageURL == "" {
		t.Error("expected non-price fields to populate even when price is missing")
	}
}

func TestMapOffers_EmptyData(t *testing.T) {
	cfg := loadConfig(t)
	body := []byte(`{"data": [], "links": {"next": {"href": ""}}}`)
	listings, nextURL, err := MapOffers(body, cfg)
	if err != nil {
		t.Fatalf("MapOffers: %v", err)
	}
	if len(listings) != 0 {
		t.Errorf("got %d listings, want 0", len(listings))
	}
	if nextURL != "" {
		t.Errorf("nextURL = %q, want empty", nextURL)
	}
}

func TestMapOffers_MalformedJSON(t *testing.T) {
	cfg := loadConfig(t)
	if _, _, err := MapOffers([]byte(`{not valid`), cfg); err == nil {
		t.Fatal("expected error on malformed JSON")
	}
}

func TestMapOffers_NoAPIBlock(t *testing.T) {
	cfg, _ := parser.EmbeddedOLXBG()
	cfg.API = nil
	if _, _, err := MapOffers([]byte(`{"data": []}`), cfg); err == nil {
		t.Fatal("expected error when api block is nil")
	}
}

func TestMapOffers_DataNotArray(t *testing.T) {
	cfg := loadConfig(t)
	// listings_path resolves to an object, not an array — surface as error.
	body := []byte(`{"data": {"unexpected": "shape"}}`)
	if _, _, err := MapOffers(body, cfg); err == nil {
		t.Fatal("expected error when listings_path is not an array")
	}
}

func TestLookupPath_NumericIndex(t *testing.T) {
	root := map[string]any{
		"photos": []any{
			map[string]any{"link": "first"},
			map[string]any{"link": "second"},
		},
	}
	got, ok := lookupPath(root, "photos.1.link")
	if !ok {
		t.Fatal("lookup failed")
	}
	if got != "second" {
		t.Errorf("got %v, want \"second\"", got)
	}
}

func TestLookupPath_OutOfBounds(t *testing.T) {
	root := map[string]any{"photos": []any{map[string]any{"link": "first"}}}
	if _, ok := lookupPath(root, "photos.5.link"); ok {
		t.Fatal("expected ok=false for out-of-bounds index")
	}
}

func TestStringify_NumericID(t *testing.T) {
	// json.Unmarshal returns float64 for all numbers — IDs must render as integers.
	got := stringify(float64(1234567))
	if got != "1234567" {
		t.Errorf("stringify(1234567) = %q, want \"1234567\"", got)
	}
}
