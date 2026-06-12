package scraper

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/Hari-Hristov/the-great-find/backend/internal/parser"
)

// loadConfig loads the embedded parser config for use in tests.
// Using the real config (not a synthetic one) means these tests catch
// drift between the JSON config and the Go extractor logic.
func loadConfig(t *testing.T) *parser.Config {
	t.Helper()
	cfg, err := parser.EmbeddedOLXBG()
	if err != nil {
		t.Fatalf("load embedded parser config: %v", err)
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

func TestParseGrid_ExtractsAllCards(t *testing.T) {
	cfg := loadConfig(t)
	html := loadFixture(t, "grid_three_cards.html")

	got, err := ParseGrid(html, cfg)
	if err != nil {
		t.Fatalf("ParseGrid: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("expected 3 listings, got %d", len(got))
	}
}

func TestParseGrid_StripsIDPrefix(t *testing.T) {
	cfg := loadConfig(t)
	html := loadFixture(t, "grid_three_cards.html")

	got, err := ParseGrid(html, cfg)
	if err != nil {
		t.Fatalf("ParseGrid: %v", err)
	}
	wantIDs := []string{"1234567", "9876543", "5555555"}
	for i, w := range wantIDs {
		if got[i].ExternalID != w {
			t.Errorf("listing[%d].ExternalID = %q, want %q", i, got[i].ExternalID, w)
		}
	}
}

func TestParseGrid_AbsolutizesURL(t *testing.T) {
	cfg := loadConfig(t)
	html := loadFixture(t, "grid_three_cards.html")

	got, err := ParseGrid(html, cfg)
	if err != nil {
		t.Fatalf("ParseGrid: %v", err)
	}
	want := "https://www.olx.bg/d/obiavi/iphone-15-pro-max-perfect-condition-IDabcde.html"
	if got[0].URL != want {
		t.Errorf("listing[0].URL = %q, want %q", got[0].URL, want)
	}
}

func TestParseGrid_BGNPriceParsed(t *testing.T) {
	cfg := loadConfig(t)
	html := loadFixture(t, "grid_three_cards.html")

	got, err := ParseGrid(html, cfg)
	if err != nil {
		t.Fatalf("ParseGrid: %v", err)
	}
	first := got[0]
	if first.PriceAmount == nil {
		t.Fatal("listing[0].PriceAmount is nil; expected 2100")
	}
	if *first.PriceAmount != 2100 {
		t.Errorf("listing[0].PriceAmount = %v, want 2100", *first.PriceAmount)
	}
	if first.PriceCurrency != "BGN" {
		t.Errorf("listing[0].PriceCurrency = %q, want BGN", first.PriceCurrency)
	}
	if first.PriceNegotiable {
		t.Errorf("listing[0].PriceNegotiable = true, want false")
	}
}

func TestParseGrid_EURPriceParsed(t *testing.T) {
	cfg := loadConfig(t)
	html := loadFixture(t, "grid_three_cards.html")

	got, err := ParseGrid(html, cfg)
	if err != nil {
		t.Fatalf("ParseGrid: %v", err)
	}
	second := got[1]
	if second.PriceAmount == nil {
		t.Fatal("listing[1].PriceAmount is nil; expected 12500")
	}
	if *second.PriceAmount != 12500 {
		t.Errorf("listing[1].PriceAmount = %v, want 12500", *second.PriceAmount)
	}
	if second.PriceCurrency != "EUR" {
		t.Errorf("listing[1].PriceCurrency = %q, want EUR", second.PriceCurrency)
	}
}

func TestParseGrid_NegotiablePriceFlagged(t *testing.T) {
	cfg := loadConfig(t)
	html := loadFixture(t, "grid_three_cards.html")

	got, err := ParseGrid(html, cfg)
	if err != nil {
		t.Fatalf("ParseGrid: %v", err)
	}
	third := got[2]
	if third.PriceAmount != nil {
		t.Errorf("listing[2].PriceAmount = %v, want nil (negotiable)", *third.PriceAmount)
	}
	if !third.PriceNegotiable {
		t.Errorf("listing[2].PriceNegotiable = false, want true")
	}
}

func TestParseGrid_LocationAndPostedSplit(t *testing.T) {
	cfg := loadConfig(t)
	html := loadFixture(t, "grid_three_cards.html")

	got, err := ParseGrid(html, cfg)
	if err != nil {
		t.Fatalf("ParseGrid: %v", err)
	}
	if got[0].LocationCity != "София" {
		t.Errorf("listing[0].LocationCity = %q, want София", got[0].LocationCity)
	}
	if got[0].PostedAtRaw != "Днес 14:32" {
		t.Errorf("listing[0].PostedAtRaw = %q, want 'Днес 14:32'", got[0].PostedAtRaw)
	}
}

func TestParseGrid_PromotedFlagDetected(t *testing.T) {
	cfg := loadConfig(t)
	html := loadFixture(t, "grid_three_cards.html")

	got, err := ParseGrid(html, cfg)
	if err != nil {
		t.Fatalf("ParseGrid: %v", err)
	}
	if !got[0].PromotedTop {
		t.Errorf("listing[0].PromotedTop = false, want true (data-testid='adCard-featured')")
	}
	if got[1].PromotedTop {
		t.Errorf("listing[1].PromotedTop = true, want false")
	}
}

func TestParseDetail_MergesIntoBase(t *testing.T) {
	cfg := loadConfig(t)
	html := loadFixture(t, "detail_iphone.html")

	base := Listing{
		ExternalID: "1234567",
		URL:        "https://www.olx.bg/d/obiavi/iphone-15.html",
		Title:      "iPhone 15 Pro Max — отлично състояние",
	}

	got, err := ParseDetail(html, cfg, base)
	if err != nil {
		t.Fatalf("ParseDetail: %v", err)
	}

	if got.ExternalID != "1234567" {
		t.Errorf("ExternalID overwritten: got %q", got.ExternalID)
	}
	if got.Title != base.Title {
		t.Errorf("Title overwritten: got %q", got.Title)
	}
	if got.Description == "" {
		t.Errorf("Description not extracted")
	}
	if got.SellerName != "Иван П." {
		t.Errorf("SellerName = %q, want 'Иван П.'", got.SellerName)
	}
	if got.SellerType != "частно лице" {
		t.Errorf("SellerType = %q, want 'частно лице' (lowercased)", got.SellerType)
	}
	if len(got.Photos) != 3 {
		t.Errorf("Photos len = %d, want 3", len(got.Photos))
	}
	if got.Params["Гаранция"] != "Да" {
		t.Errorf("Params['Гаранция'] = %q, want 'Да'", got.Params["Гаранция"])
	}
	if got.Params["Цвят"] != "Natural Titanium" {
		t.Errorf("Params['Цвят'] = %q, want 'Natural Titanium'", got.Params["Цвят"])
	}
}

func TestParsePrice_Cases(t *testing.T) {
	cases := []struct {
		in           string
		wantAmount   *float64
		wantCurrency string
		wantNeg      bool
	}{
		{"2 100 лв.", float64Ptr(2100), "BGN", false},
		{"12 500 EUR", float64Ptr(12500), "EUR", false},
		{"600 €", float64Ptr(600), "EUR", false},
		{"По договаряне", nil, "", true},
		{"Negotiable", nil, "", true},
		{"", nil, "", false},
		{"1.500,50 лв.", float64Ptr(1500.50), "BGN", false},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			amount, currency, neg := parsePrice(tc.in)
			if (amount == nil) != (tc.wantAmount == nil) {
				t.Fatalf("amount nil-mismatch: got %v, want %v", amount, tc.wantAmount)
			}
			if amount != nil && *amount != *tc.wantAmount {
				t.Errorf("amount = %v, want %v", *amount, *tc.wantAmount)
			}
			if currency != tc.wantCurrency {
				t.Errorf("currency = %q, want %q", currency, tc.wantCurrency)
			}
			if neg != tc.wantNeg {
				t.Errorf("negotiable = %v, want %v", neg, tc.wantNeg)
			}
		})
	}
}

func TestStripIDPrefix_Cases(t *testing.T) {
	cases := map[string]string{
		"ad-1234":      "1234",
		"card-9876":    "9876",
		"listing-555":  "555",
		"raw-no-strip": "raw-no-strip",
		"":             "",
		"ad-":          "",
	}
	for in, want := range cases {
		if got := stripIDPrefix(in); got != want {
			t.Errorf("stripIDPrefix(%q) = %q, want %q", in, got, want)
		}
	}
}

func float64Ptr(v float64) *float64 { return &v }
