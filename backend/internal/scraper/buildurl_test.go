package scraper_test

import (
	"strings"
	"testing"

	"github.com/harihristov/the-great-find/backend/internal/parser"
	"github.com/harihristov/the-great-find/backend/internal/scraper"
)

// These tests previously lived next to scheduler.buildSearchURL. The function
// moved to scraper.BuildSearchURL when the scheduler grew a Fetcher interface
// and the URL builder graduated to package-level — same logic, same coverage.

func TestBuildSearchURL_SubstitutesKeyword(t *testing.T) {
	cfg, _ := parser.EmbeddedOLXBG()
	got, err := scraper.BuildSearchURL(cfg, []byte(`{"keyword":"iphone 15"}`))
	if err != nil {
		t.Fatalf("BuildSearchURL: %v", err)
	}
	if got == "" {
		t.Fatal("got empty url")
	}
	// Keyword wraps as q-{value}. Space encodes once (q-iphone%2015).
	// Double-encoding (q-iphone%252015) means a u.PathEscape was applied
	// before u.String() also encoded — produces 404s on olx.bg.
	if !strings.Contains(got, "q-iphone%2015") {
		t.Errorf("expected q-iphone%%2015 in url: %s", got)
	}
	if strings.Contains(got, "%2520") {
		t.Errorf("url is double-encoded (%%2520 found): %s", got)
	}
	if strings.Contains(got, "{keyword}") {
		t.Errorf("placeholder leaked: %s", got)
	}
}

func TestBuildSearchURL_KeywordWithCyrillic(t *testing.T) {
	cfg, _ := parser.EmbeddedOLXBG()
	got, err := scraper.BuildSearchURL(cfg, []byte(`{"keyword":"книга"}`))
	if err != nil {
		t.Fatalf("BuildSearchURL: %v", err)
	}
	if strings.Contains(got, "%2520") || strings.Contains(got, "%25D0") {
		t.Errorf("url is double-encoded: %s", got)
	}
	if !strings.Contains(got, "q-%D0%BA%D0%BD%D0%B8%D0%B3%D0%B0") {
		t.Errorf("expected single-encoded cyrillic in q- segment: %s", got)
	}
}

func TestBuildSearchURL_KeywordWithSpaceAndPriceRange(t *testing.T) {
	cfg, _ := parser.EmbeddedOLXBG()
	got, err := scraper.BuildSearchURL(cfg, []byte(`{"keyword":"steam deck","price_min":"50","price_max":"400"}`))
	if err != nil {
		t.Fatalf("BuildSearchURL: %v", err)
	}
	if !strings.Contains(got, "q-steam%20deck") {
		t.Errorf("expected q-steam%%20deck path segment, got: %s", got)
	}
	if strings.Contains(got, "%2520") {
		t.Errorf("double-encoded url: %s", got)
	}
	if !strings.Contains(got, "search%5Bfilter_float_price%3Afrom%5D=50") {
		t.Errorf("expected price_min mapped to search[filter_float_price:from]: %s", got)
	}
}

func TestBuildSearchURL_CategoryPathAndDefaults(t *testing.T) {
	cfg, _ := parser.EmbeddedOLXBG()
	got, err := scraper.BuildSearchURL(cfg, []byte(`{
		"category": "elektronika/igri-i-konzoli",
		"keyword":  "nintendo switch oled"
	}`))
	if err != nil {
		t.Fatalf("BuildSearchURL: %v", err)
	}
	if !strings.Contains(got, "/elektronika/igri-i-konzoli/q-nintendo%20switch%20oled/") {
		t.Errorf("expected category + keyword path, got: %s", got)
	}
	if !strings.Contains(got, "currency=EUR") {
		t.Errorf("expected default currency=EUR, got: %s", got)
	}
	if !strings.Contains(got, "search%5Border%5D=created_at%3Adesc") {
		t.Errorf("expected default sort=created_at:desc, got: %s", got)
	}
}

func TestBuildSearchURL_LocationPathSegment(t *testing.T) {
	cfg, _ := parser.EmbeddedOLXBG()
	got, err := scraper.BuildSearchURL(cfg, []byte(`{
		"category": "elektronika/igri-i-konzoli",
		"location": "oblast-sofiya-grad",
		"keyword":  "ps5"
	}`))
	if err != nil {
		t.Fatalf("BuildSearchURL: %v", err)
	}
	if !strings.Contains(got, "/elektronika/igri-i-konzoli/oblast-sofiya-grad/q-ps5/") {
		t.Errorf("expected location segment between category and keyword, got: %s", got)
	}
}

func TestBuildSearchURL_DefaultCategoryWhenOmitted(t *testing.T) {
	cfg, _ := parser.EmbeddedOLXBG()
	got, err := scraper.BuildSearchURL(cfg, []byte(`{"keyword":"foo"}`))
	if err != nil {
		t.Fatalf("BuildSearchURL: %v", err)
	}
	if !strings.Contains(got, "/ads/q-foo/") {
		t.Errorf("expected /ads/q-foo/ fallback path, got: %s", got)
	}
}

func TestBuildSearchURL_EnumViolationFailsLoud(t *testing.T) {
	cfg, _ := parser.EmbeddedOLXBG()
	_, err := scraper.BuildSearchURL(cfg, []byte(`{"condition":"refurbished"}`))
	if err == nil {
		t.Fatal("expected error for condition value not in enum")
	}
}

func TestBuildSearchURL_OverridingDefault(t *testing.T) {
	cfg, _ := parser.EmbeddedOLXBG()
	got, err := scraper.BuildSearchURL(cfg, []byte(`{"currency":"BGN","keyword":"x"}`))
	if err != nil {
		t.Fatalf("BuildSearchURL: %v", err)
	}
	if !strings.Contains(got, "currency=BGN") {
		t.Errorf("user override lost: %s", got)
	}
	if strings.Contains(got, "currency=EUR") {
		t.Errorf("default leaked despite override: %s", got)
	}
}

func TestBuildSearchURL_RejectsBadJSON(t *testing.T) {
	cfg, _ := parser.EmbeddedOLXBG()
	if _, err := scraper.BuildSearchURL(cfg, []byte("not json")); err == nil {
		t.Fatal("expected error on bad query_params JSON")
	}
}

func TestBuildSearchURL_FiltersUnknownParams(t *testing.T) {
	cfg, _ := parser.EmbeddedOLXBG()
	got, err := scraper.BuildSearchURL(cfg, []byte(`{"keyword":"foo","evil_param":"injected"}`))
	if err != nil {
		t.Fatalf("BuildSearchURL: %v", err)
	}
	if strings.Contains(got, "evil_param") {
		t.Errorf("evil_param should have been filtered: %s", got)
	}
}
