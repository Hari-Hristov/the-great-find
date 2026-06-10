package apiclient

import "strings"

// translitMap is a token-level Latin↔Cyrillic alias table for product/brand
// nouns common in the Bulgarian olx.bg listings. Keys and values are both the
// canonical lowercase form of one word; ExpandKeyword consults the union of
// (key→value) and (value→key), so a token matching either side expands to a
// pair of variants. Each token expands to at most one alias (1:1 map).
//
// Add new entries when the user reports missed listings traceable to a
// language-only mismatch. Multi-word phrases (e.g. "iphone pro") aren't
// supported — list each word separately.
var translitMap = map[string]string{
	"nintendo":    "нинтендо",
	"switch":      "суич",
	"playstation": "плейстейшън",
	"xbox":        "ексбокс",
	"iphone":      "айфон",
	"samsung":     "самсунг",
	"macbook":     "макбук",
	"konsola":     "конзола",
	"console":     "конзола",
}

// ExpandKeyword takes a saved-search keyword string and returns every variant
// the scheduler should fan out over. The original is always first in the
// result; variants follow in stable order. Empty input yields a single empty
// element so callers can iterate uniformly.
//
// Tokenization is pure whitespace splitting; punctuation stays attached to
// neighbouring tokens. Substitution is per-token and bidirectional: a Cyrillic
// token in the input expands to its Latin pair too. Unknown tokens pass
// through untouched. Variants identical to the original are deduped.
func ExpandKeyword(keyword string) []string {
	original := keyword
	if strings.TrimSpace(original) == "" {
		return []string{original}
	}

	aliases := buildAliasIndex()
	tokens := strings.Fields(original)

	swapped := make([]string, len(tokens))
	anySwap := false
	for i, tok := range tokens {
		lower := strings.ToLower(tok)
		if alias, ok := aliases[lower]; ok {
			swapped[i] = preserveCase(tok, alias)
			anySwap = true
		} else {
			swapped[i] = tok
		}
	}

	if !anySwap {
		return []string{original}
	}

	variant := strings.Join(swapped, " ")
	if variant == original {
		return []string{original}
	}
	return []string{original, variant}
}

// buildAliasIndex flattens translitMap into a single lookup table containing
// both directions: latin→cyrillic and cyrillic→latin.
func buildAliasIndex() map[string]string {
	out := make(map[string]string, len(translitMap)*2)
	for k, v := range translitMap {
		out[k] = v
		out[v] = k
	}
	return out
}

// preserveCase mirrors the casing of the source token onto the alias when the
// alias is also Latin script. For Cyrillic↔Latin swaps the case lift is a
// best-effort lowercase — Cyrillic capitalization rarely matters for olx.bg's
// search and the API is case-insensitive in practice.
func preserveCase(src, alias string) string {
	if isAllUpper(src) {
		return strings.ToUpper(alias)
	}
	if isTitleCase(src) {
		return titleCase(alias)
	}
	return alias
}

func isAllUpper(s string) bool {
	hasLetter := false
	for _, r := range s {
		if r >= 'a' && r <= 'z' {
			return false
		}
		if (r >= 'A' && r <= 'Z') || (r >= 'А' && r <= 'Я') {
			hasLetter = true
		}
	}
	return hasLetter
}

func isTitleCase(s string) bool {
	if s == "" {
		return false
	}
	first := []rune(s)[0]
	return (first >= 'A' && first <= 'Z') || (first >= 'А' && first <= 'Я')
}

func titleCase(s string) string {
	if s == "" {
		return s
	}
	runes := []rune(s)
	runes[0] = []rune(strings.ToUpper(string(runes[0])))[0]
	return string(runes)
}
