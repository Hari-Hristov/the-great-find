// Package money normalizes prices to a single canonical currency.
//
// Bulgaria adopted the euro on 2026-01-01. The app stores listings with whatever
// currency the listing card displays (BGN or EUR — both still appear during the
// transition), but every comparison, sort, alert evaluation, and UI display
// converts to EUR via the official fixed peg.
//
// There is no FX-rate fetching and no exchange_rates table writes for this case
// — the BGN↔EUR rate is fixed by ECB and will not change.
package money

import "math"

// EURPerBGN is the official ECB-fixed peg used to lock the lev to the euro
// at adoption. 1 EUR = 1.95583 BGN, hence 1 BGN = 1 / 1.95583 EUR.
const BGNPerEUR = 1.95583

// ToEUR converts (amount, currency) to EUR. Returns ok=false when the currency
// is unknown or amount is NaN/negative — callers should treat that as "skip
// this comparison" rather than substituting zero.
func ToEUR(amount float64, currency string) (float64, bool) {
	if math.IsNaN(amount) || math.IsInf(amount, 0) || amount < 0 {
		return 0, false
	}
	switch currency {
	case "EUR", "eur", "€":
		return amount, true
	case "BGN", "bgn", "лв.", "лв":
		return amount / BGNPerEUR, true
	default:
		return 0, false
	}
}
