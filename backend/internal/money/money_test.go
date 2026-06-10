package money

import (
	"math"
	"testing"
)

func TestToEUR_PassThroughEUR(t *testing.T) {
	got, ok := ToEUR(100, "EUR")
	if !ok || got != 100 {
		t.Fatalf("ToEUR(100, EUR) = (%v, %v), want (100, true)", got, ok)
	}
}

func TestToEUR_ConvertsBGN(t *testing.T) {
	got, ok := ToEUR(BGNPerEUR, "BGN")
	if !ok {
		t.Fatal("BGN should convert")
	}
	if math.Abs(got-1.0) > 1e-9 {
		t.Errorf("ToEUR(1.95583, BGN) = %v, want 1.0", got)
	}
}

func TestToEUR_AcceptsCurrencyAliases(t *testing.T) {
	cases := []struct {
		amount float64
		curr   string
		wantOK bool
	}{
		{50, "EUR", true},
		{50, "eur", true},
		{50, "€", true},
		{50, "BGN", true},
		{50, "bgn", true},
		{50, "лв.", true},
		{50, "лв", true},
		{50, "USD", false},
		{50, "", false},
	}
	for _, tc := range cases {
		_, ok := ToEUR(tc.amount, tc.curr)
		if ok != tc.wantOK {
			t.Errorf("ToEUR(_, %q): ok = %v, want %v", tc.curr, ok, tc.wantOK)
		}
	}
}

func TestToEUR_RejectsBadAmounts(t *testing.T) {
	cases := []float64{math.NaN(), math.Inf(1), math.Inf(-1), -1}
	for _, v := range cases {
		if _, ok := ToEUR(v, "EUR"); ok {
			t.Errorf("ToEUR(%v, EUR) should reject", v)
		}
	}
}
