package scheduler

import (
	"strconv"
	"strings"
	"time"
	"unicode"
)

// sofiaLoc is olx.bg's local timezone — what "Днес 14:32" is implicitly relative to.
// Falls back to UTC if the tzdata isn't available (Windows without ICU, embedded build).
var sofiaLoc = func() *time.Location {
	if l, err := time.LoadLocation("Europe/Sofia"); err == nil {
		return l
	}
	// Fixed +02:00 — the EET offset; we lose DST correctness here, which is fine
	// because today's posts already get re-validated by the next poll's "Днес".
	return time.FixedZone("EET", 2*60*60)
}()

// bgMonths maps olx.bg's short Bulgarian month abbreviations to time.Month.
// Only short forms appear in the listing grid; the detail page uses the same.
var bgMonths = map[string]time.Month{
	"яну": time.January, "ян": time.January,
	"фев": time.February, "февр": time.February,
	"мар": time.March, "март": time.March,
	"апр": time.April,
	"май": time.May,
	"юни": time.June,
	"юли": time.July,
	"авг": time.August,
	"сеп": time.September, "септ": time.September,
	"окт": time.October,
	"ное": time.November, "ноем": time.November,
	"дек": time.December,
}

// parsePostedAt converts an olx.bg "posted at" string into a UTC time.
// Returns the zero time + false when the input is empty or unrecognized — callers
// should NOT treat that as "old"; recency filtering should keep listings whose
// timestamp couldn't be parsed (a parser bug shouldn't silently nuke real listings).
func parsePostedAt(raw string, now time.Time) (time.Time, bool) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return time.Time{}, false
	}

	// ISO 8601 / RFC3339 — what the JSON API path sends (e.g. "2026-06-01T19:13:56+03:00").
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), true
	}

	// Detail page prefixes with "Публикувана: ".
	s = strings.TrimPrefix(s, "Публикувана:")
	s = strings.TrimPrefix(s, "Публикувана")
	s = strings.TrimSpace(s)
	// Grid sometimes prefixes location: "София - Днес 14:32". Take the part after the dash.
	if i := strings.LastIndex(s, " - "); i >= 0 {
		s = strings.TrimSpace(s[i+3:])
	}

	nowSofia := now.In(sofiaLoc)

	if rest, ok := trimPrefixFold(s, "Днес"); ok {
		hh, mm, ok := parseHM(rest)
		if !ok {
			// "Днес" with no time → midnight Sofia.
			hh, mm = 0, 0
		}
		t := time.Date(nowSofia.Year(), nowSofia.Month(), nowSofia.Day(), hh, mm, 0, 0, sofiaLoc)
		return t.UTC(), true
	}
	if rest, ok := trimPrefixFold(s, "Вчера"); ok {
		hh, mm, ok := parseHM(rest)
		if !ok {
			hh, mm = 0, 0
		}
		y := nowSofia.AddDate(0, 0, -1)
		t := time.Date(y.Year(), y.Month(), y.Day(), hh, mm, 0, 0, sofiaLoc)
		return t.UTC(), true
	}

	// "<DD> <bg-month> [YYYY]" — short Bulgarian month, optional year.
	if t, ok := parseDayMonth(s, nowSofia); ok {
		return t.UTC(), true
	}

	// English fallback for the test fixture forms ("Sep 12", "12 Sep").
	for _, layout := range []string{"2 Jan 2006", "Jan 2 2006", "2 Jan", "Jan 2"} {
		if t, err := time.ParseInLocation(layout, s, sofiaLoc); err == nil {
			if t.Year() == 0 {
				t = time.Date(nowSofia.Year(), t.Month(), t.Day(), 0, 0, 0, 0, sofiaLoc)
				if t.After(nowSofia) {
					t = t.AddDate(-1, 0, 0)
				}
			}
			return t.UTC(), true
		}
	}

	// Unix timestamp (seconds) — the JSON API path sets created_time as an integer.
	if n, err := strconv.ParseInt(s, 10, 64); err == nil && n > 0 {
		return time.Unix(n, 0).UTC(), true
	}

	return time.Time{}, false
}

// parseHM tolerates leading whitespace and an optional "г." or comma separator
// before the time, returning hours+minutes from "HH:MM".
func parseHM(rest string) (int, int, bool) {
	rest = strings.TrimLeft(rest, " ,гч.")
	rest = strings.TrimSpace(rest)
	if len(rest) < 4 {
		return 0, 0, false
	}
	// Find the first colon; expect HH:MM around it.
	colon := strings.IndexByte(rest, ':')
	if colon < 1 || colon+3 > len(rest) {
		return 0, 0, false
	}
	hh, ok1 := atoi2(rest[:colon])
	mm, ok2 := atoi2(rest[colon+1 : colon+3])
	if !ok1 || !ok2 || hh > 23 || mm > 59 {
		return 0, 0, false
	}
	return hh, mm, true
}

func atoi2(s string) (int, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, false
	}
	n := 0
	for _, r := range s {
		if !unicode.IsDigit(r) {
			return 0, false
		}
		n = n*10 + int(r-'0')
	}
	return n, true
}

// parseDayMonth handles "12 сеп" / "12 сеп 2026" (case-insensitive month).
func parseDayMonth(s string, now time.Time) (time.Time, bool) {
	parts := strings.Fields(s)
	if len(parts) < 2 {
		return time.Time{}, false
	}
	day, ok := atoi2(parts[0])
	if !ok || day < 1 || day > 31 {
		return time.Time{}, false
	}
	monKey := strings.ToLower(strings.TrimRight(parts[1], "."))
	mon, ok := bgMonths[monKey]
	if !ok {
		return time.Time{}, false
	}
	year := now.Year()
	if len(parts) >= 3 {
		if y, ok := atoi2(parts[2]); ok && y >= 2000 && y <= 2100 {
			year = y
		}
	}
	t := time.Date(year, mon, day, 0, 0, 0, 0, sofiaLoc)
	// No year given and the parsed date is in the future → roll back a year.
	if len(parts) < 3 && t.After(now) {
		t = t.AddDate(-1, 0, 0)
	}
	return t, true
}

// trimPrefixFold trims prefix case-insensitively (Unicode-correct via ToLower)
// and returns the remainder + ok.
func trimPrefixFold(s, prefix string) (string, bool) {
	if len(s) < len(prefix) {
		return "", false
	}
	if strings.EqualFold(s[:len(prefix)], prefix) {
		return s[len(prefix):], true
	}
	return "", false
}
