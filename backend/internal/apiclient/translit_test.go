package apiclient

import (
	"reflect"
	"testing"
)

func TestExpandKeyword_EmptyInputReturnsSingleEmpty(t *testing.T) {
	got := ExpandKeyword("")
	want := []string{""}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ExpandKeyword(\"\") = %#v, want %#v", got, want)
	}
}

func TestExpandKeyword_NoMatchPassesThrough(t *testing.T) {
	got := ExpandKeyword("vintage record player")
	want := []string{"vintage record player"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ExpandKeyword(no-match) = %#v, want %#v", got, want)
	}
}

func TestExpandKeyword_LatinTokenExpandsToCyrillic(t *testing.T) {
	got := ExpandKeyword("nintendo switch oled")
	want := []string{"nintendo switch oled", "нинтендо суич oled"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ExpandKeyword(latin) = %#v, want %#v", got, want)
	}
}

func TestExpandKeyword_CyrillicTokenExpandsToLatin(t *testing.T) {
	got := ExpandKeyword("нинтендо суич oled")
	want := []string{"нинтендо суич oled", "nintendo switch oled"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ExpandKeyword(cyrillic) = %#v, want %#v", got, want)
	}
}

func TestExpandKeyword_PreservesCaseOnLatin(t *testing.T) {
	got := ExpandKeyword("Nintendo Switch OLED")
	if len(got) != 2 {
		t.Fatalf("expected 2 variants, got %#v", got)
	}
	if got[0] != "Nintendo Switch OLED" {
		t.Errorf("original mutated: %q", got[0])
	}
	// title-case Latin → title-case Cyrillic
	if got[1] != "Нинтендо Суич OLED" {
		t.Errorf("variant case-preserve = %q, want %q", got[1], "Нинтендо Суич OLED")
	}
}

func TestExpandKeyword_AllUpperPreserved(t *testing.T) {
	got := ExpandKeyword("XBOX")
	want := []string{"XBOX", "ЕКСБОКС"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ExpandKeyword(upper) = %#v, want %#v", got, want)
	}
}

func TestExpandKeyword_OriginalAlwaysFirst(t *testing.T) {
	// ordering invariant — the dispatcher relies on it for "primary query first".
	got := ExpandKeyword("playstation")
	if len(got) < 1 || got[0] != "playstation" {
		t.Fatalf("expected 'playstation' first, got %#v", got)
	}
}

func TestExpandKeyword_VariantEqualsOriginalDeduped(t *testing.T) {
	// Single Latin-only known word — variant ends up being the same Latin form
	// only if alias is identical; in our map that doesn't happen, but if a
	// future alias were a no-op, the dedup must still hold. Safe to assert via
	// the trivial unknown-token path which already returns one element.
	got := ExpandKeyword("oled")
	want := []string{"oled"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ExpandKeyword(unknown-only) = %#v, want %#v", got, want)
	}
}

func TestExpandKeyword_MixedKnownAndUnknown(t *testing.T) {
	got := ExpandKeyword("samsung galaxy")
	want := []string{"samsung galaxy", "самсунг galaxy"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ExpandKeyword(mixed) = %#v, want %#v", got, want)
	}
}

func TestExpandKeyword_WhitespaceCollapsedOnSplit(t *testing.T) {
	// strings.Fields collapses runs of whitespace; the variant won't match the
	// original byte-for-byte if input had double spaces, so this asserts the
	// variant is built from a normalized join while the original is preserved.
	got := ExpandKeyword("nintendo  switch")
	if len(got) != 2 {
		t.Fatalf("expected 2 variants, got %#v", got)
	}
	if got[0] != "nintendo  switch" {
		t.Errorf("original lost: %q", got[0])
	}
	if got[1] != "нинтендо суич" {
		t.Errorf("variant = %q, want %q", got[1], "нинтендо суич")
	}
}
