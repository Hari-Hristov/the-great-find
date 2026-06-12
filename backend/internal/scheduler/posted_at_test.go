package scheduler

import (
	"testing"
	"time"
)

func TestParsePostedAt(t *testing.T) {
	// Pin "now" to a known instant in Sofia time so all relative forms ("Днес",
	// "Вчера") resolve deterministically. 2026-06-09 15:00 Sofia (= 12:00 UTC).
	loc := sofiaLoc
	now := time.Date(2026, 6, 9, 15, 0, 0, 0, loc)

	tests := []struct {
		name     string
		raw      string
		wantOK   bool
		wantUTC  time.Time
		wantZero bool
	}{
		{
			name:    "today, grid form",
			raw:     "Днес 14:32",
			wantOK:  true,
			wantUTC: time.Date(2026, 6, 9, 14, 32, 0, 0, loc).UTC(),
		},
		{
			name:    "today, detail form with prefix",
			raw:     "Публикувана: Днес 14:32",
			wantOK:  true,
			wantUTC: time.Date(2026, 6, 9, 14, 32, 0, 0, loc).UTC(),
		},
		{
			name:    "today, with location prefix",
			raw:     "София - Днес 14:32",
			wantOK:  true,
			wantUTC: time.Date(2026, 6, 9, 14, 32, 0, 0, loc).UTC(),
		},
		{
			name:    "yesterday",
			raw:     "Вчера 09:15",
			wantOK:  true,
			wantUTC: time.Date(2026, 6, 8, 9, 15, 0, 0, loc).UTC(),
		},
		{
			name:    "explicit day-month, current year inferred",
			raw:     "12 май",
			wantOK:  true,
			wantUTC: time.Date(2026, 5, 12, 0, 0, 0, 0, loc).UTC(),
		},
		{
			name:    "day-month with future-looking month rolls back a year",
			raw:     "12 дек",
			wantOK:  true,
			wantUTC: time.Date(2025, 12, 12, 0, 0, 0, 0, loc).UTC(),
		},
		{
			name:    "day-month-year explicit",
			raw:     "12 сеп 2025",
			wantOK:  true,
			wantUTC: time.Date(2025, 9, 12, 0, 0, 0, 0, loc).UTC(),
		},
		{
			name:    "english fallback Jan 2 with year",
			raw:     "12 May 2025",
			wantOK:  true,
			wantUTC: time.Date(2025, 5, 12, 0, 0, 0, 0, loc).UTC(),
		},
		{
			name:     "empty input returns zero",
			raw:      "",
			wantOK:   false,
			wantZero: true,
		},
		{
			name:     "garbage returns zero",
			raw:      "не знам кога",
			wantOK:   false,
			wantZero: true,
		},
		{
			name:    "ISO 8601 with timezone offset — JSON API path",
			raw:     "2026-06-01T19:13:56+03:00",
			wantOK:  true,
			wantUTC: time.Date(2026, 6, 1, 16, 13, 56, 0, time.UTC),
		},
		{
			name:    "unix timestamp from JSON API path",
			raw:     "1749470400",
			wantOK:  true,
			wantUTC: time.Unix(1749470400, 0).UTC(),
		},
		{
			name:     "zero unix timestamp rejected",
			raw:      "0",
			wantOK:   false,
			wantZero: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := parsePostedAt(tc.raw, now)
			if ok != tc.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tc.wantOK)
			}
			if tc.wantZero && !got.IsZero() {
				t.Fatalf("expected zero time, got %v", got)
			}
			if tc.wantOK && !got.Equal(tc.wantUTC) {
				t.Fatalf("got %v, want %v", got, tc.wantUTC)
			}
		})
	}
}

func TestParsePostedAt_RecencyMath(t *testing.T) {
	// Sanity — the recency filter math relies on now.Sub(parsed) > cutoff.
	now := time.Date(2026, 6, 9, 15, 0, 0, 0, sofiaLoc)
	old, ok := parsePostedAt("12 дек", now) // resolves to 2025-12-12, ~6 months ago
	if !ok {
		t.Fatal("expected parse to succeed")
	}
	if now.Sub(old) <= 30*24*time.Hour {
		t.Fatalf("expected age > 30d, got %v", now.Sub(old))
	}
	fresh, ok := parsePostedAt("Днес 12:00", now)
	if !ok {
		t.Fatal("expected parse to succeed")
	}
	if now.Sub(fresh) > 30*24*time.Hour {
		t.Fatalf("expected age <= 30d, got %v", now.Sub(fresh))
	}
}
