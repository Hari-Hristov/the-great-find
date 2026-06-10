package scheduler

import (
	"encoding/json"
	"reflect"
	"sort"
	"testing"

	"github.com/harihristov/the-great-find/backend/internal/scraper"
)

func TestExpandQueryParams_NilInput(t *testing.T) {
	out, err := expandQueryParams(nil)
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if len(out) != 1 || out[0] != nil {
		t.Fatalf("nil input should yield [nil], got %#v", out)
	}
}

func TestExpandQueryParams_KeywordExpandsToTwoVariants(t *testing.T) {
	in, _ := json.Marshal(map[string]any{
		"keyword":   "nintendo switch",
		"price_max": "300",
	})
	out, err := expandQueryParams(in)
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if len(out) != 2 {
		t.Fatalf("expected 2 variants for known-word keyword, got %d: %v", len(out), stringify(out))
	}
	got := decodeKeywords(t, out)
	want := []string{"nintendo switch", "нинтендо суич"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("variants = %#v, want %#v", got, want)
	}
	// price_max must survive on every emitted JSON.
	for i, raw := range out {
		var m map[string]any
		_ = json.Unmarshal(raw, &m)
		if m["price_max"] != "300" {
			t.Errorf("variant %d lost price_max: %v", i, m)
		}
	}
}

func TestExpandQueryParams_UserVariantsAppendedAndStripped(t *testing.T) {
	in, _ := json.Marshal(map[string]any{
		"keyword":          "nintendo switch",
		"keyword_variants": []any{"konzola oled", "switch oled konzola"},
	})
	out, err := expandQueryParams(in)
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	got := decodeKeywords(t, out)
	want := []string{
		"nintendo switch",
		"нинтендо суич",
		"konzola oled",
		"switch oled konzola",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("variants = %#v, want %#v", got, want)
	}
	// keyword_variants must NOT survive on any emitted JSON — apiclient would drop
	// it anyway, but emitting a clean shape keeps the wire log readable.
	for i, raw := range out {
		var m map[string]any
		_ = json.Unmarshal(raw, &m)
		if _, ok := m["keyword_variants"]; ok {
			t.Errorf("variant %d still has keyword_variants: %s", i, raw)
		}
	}
}

func TestExpandQueryParams_NoKeywordEmitsCleanedJSONOnce(t *testing.T) {
	in, _ := json.Marshal(map[string]any{
		"price_min":        "10",
		"keyword_variants": []any{"x"}, // ignored without a keyword to anchor
	})
	out, err := expandQueryParams(in)
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if len(out) != 1 {
		t.Fatalf("filter-only search should fan out to 1 entry, got %d", len(out))
	}
	var m map[string]any
	_ = json.Unmarshal(out[0], &m)
	if _, ok := m["keyword_variants"]; ok {
		t.Errorf("keyword_variants survived: %s", out[0])
	}
}

func TestExpandQueryParams_BadJSONReturnsError(t *testing.T) {
	if _, err := expandQueryParams([]byte("not-json")); err == nil {
		t.Fatal("expected decode error")
	}
}

func TestExpandQueryParams_DuplicateVariantsDeduped(t *testing.T) {
	in, _ := json.Marshal(map[string]any{
		"keyword":          "nintendo switch",
		"keyword_variants": []any{"nintendo switch", "нинтендо суич"}, // both already in built-in expansion
	})
	out, err := expandQueryParams(in)
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	got := decodeKeywords(t, out)
	want := []string{"nintendo switch", "нинтендо суич"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("dedup failed: %#v", got)
	}
}

func TestDedupeListingsByExternalID_FirstOccurrenceWins(t *testing.T) {
	in := []scraper.Listing{
		{ExternalID: "a", Title: "first"},
		{ExternalID: "b", Title: "second"},
		{ExternalID: "a", Title: "duplicate"},
	}
	out := dedupeListingsByExternalID(in)
	if len(out) != 2 {
		t.Fatalf("expected 2 deduped, got %d", len(out))
	}
	if out[0].Title != "first" || out[1].Title != "second" {
		t.Fatalf("order/winner wrong: %#v", out)
	}
}

func TestDedupeListingsByExternalID_EmptyExternalIDsKept(t *testing.T) {
	// Empty external_id is a parser miss, not a dedup key — keep them all so
	// upstream can surface them in logs.
	in := []scraper.Listing{
		{ExternalID: "", Title: "x"},
		{ExternalID: "", Title: "y"},
	}
	out := dedupeListingsByExternalID(in)
	if len(out) != 2 {
		t.Fatalf("expected 2 (no dedup on empty id), got %d", len(out))
	}
}

func decodeKeywords(t *testing.T, out [][]byte) []string {
	t.Helper()
	got := make([]string, 0, len(out))
	for _, raw := range out {
		var m map[string]any
		if err := json.Unmarshal(raw, &m); err != nil {
			t.Fatalf("decode %s: %v", raw, err)
		}
		k, _ := m["keyword"].(string)
		got = append(got, k)
	}
	return got
}

func stringify(out [][]byte) []string {
	s := make([]string, len(out))
	for i, b := range out {
		s[i] = string(b)
	}
	sort.Strings(s)
	return s
}
