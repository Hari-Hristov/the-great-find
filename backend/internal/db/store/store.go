// Package store is a hand-rolled database/sql layer that implements
// scheduler.Queries directly.
//
// We'd normally generate this with sqlc, but the local Defender install
// quarantines newly-built Go binaries (including sqlc.exe), so we write the
// minimal query surface the scheduler needs by hand. The `queries/*.sql` files
// at the repo root are still authoritative — when sqlc is unblocked we can
// regenerate and swap this file out.
//
// Conventions:
//
//   - Reads go through Pools.Reader; writes go through Pools.Writer (which is
//     constrained to a single connection — SQLite has one writer).
//   - All timestamps are UTC ISO-8601 strings, matching the migration defaults.
//   - Nullable columns map to *T; non-null map to T. The scheduler expects
//     prices and timestamps to be optional.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/Hari-Hristov/the-great-find/backend/internal/db"
	"github.com/Hari-Hristov/the-great-find/backend/internal/scheduler"
)

// Store wraps a Pools and exposes the scheduler.Queries surface.
type Store struct {
	pools *db.Pools
}

func New(pools *db.Pools) *Store {
	return &Store{pools: pools}
}

// Compile-time assertion that Store satisfies scheduler.Queries.
var _ scheduler.Queries = (*Store)(nil)

func (s *Store) ListActiveSavedSearches(ctx context.Context) ([]scheduler.SavedSearch, error) {
	const q = `
		SELECT id, name, query_params, alert_criteria, poll_interval_min
		FROM saved_searches
		WHERE active = 1
		ORDER BY id`
	rows, err := s.pools.Reader.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list active searches: %w", err)
	}
	defer rows.Close()

	var out []scheduler.SavedSearch
	for rows.Next() {
		var ss scheduler.SavedSearch
		var qp string
		var ac sql.NullString
		if err := rows.Scan(&ss.ID, &ss.Name, &qp, &ac, &ss.PollIntervalMin); err != nil {
			return nil, fmt.Errorf("scan saved_search: %w", err)
		}
		ss.QueryParams = []byte(qp)
		if ac.Valid {
			ss.AlertCriteria = []byte(ac.String)
		}
		out = append(out, ss)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Store) UpdateSavedSearchPolledAt(ctx context.Context, id int64, ts time.Time) error {
	const q = `UPDATE saved_searches SET last_polled_at = ? WHERE id = ?`
	_, err := s.pools.Writer.ExecContext(ctx, q, ts.UTC().Format("2006-01-02T15:04:05.000Z"), id)
	if err != nil {
		return fmt.Errorf("update last_polled_at: %w", err)
	}
	return nil
}

func (s *Store) GetListingByExternalID(ctx context.Context, platform, country, externalID string) (*scheduler.StoredListing, error) {
	const q = `
		SELECT id, price_amount, price_currency, status
		FROM listings
		WHERE platform = ? AND country = ? AND external_id = ?`
	var l scheduler.StoredListing
	var amount sql.NullFloat64
	var currency sql.NullString
	err := s.pools.Reader.QueryRowContext(ctx, q, platform, country, externalID).
		Scan(&l.ID, &amount, &currency, &l.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get listing: %w", err)
	}
	if amount.Valid {
		v := amount.Float64
		l.PriceAmount = &v
	}
	if currency.Valid {
		l.PriceCurrency = currency.String
	}
	return &l, nil
}

func (s *Store) UpsertListing(ctx context.Context, in scheduler.UpsertListingInput) (scheduler.StoredListing, error) {
	const q = `
		INSERT INTO listings (
			platform, country, external_id, url, title,
			price_amount, price_currency, price_negotiable,
			location_region, location_city,
			posted_at,
			primary_image_url, promoted_top
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (platform, country, external_id) DO UPDATE SET
			url               = excluded.url,
			title             = excluded.title,
			price_amount      = excluded.price_amount,
			price_currency    = excluded.price_currency,
			price_negotiable  = excluded.price_negotiable,
			location_region   = excluded.location_region,
			location_city     = excluded.location_city,
			-- posted_at is intentionally NOT updated on conflict — the original
			-- post date doesn't change when we re-scrape; only fill it in if
			-- this is the first time we've learned it.
			posted_at         = COALESCE(listings.posted_at, excluded.posted_at),
			primary_image_url = excluded.primary_image_url,
			promoted_top      = excluded.promoted_top,
			scraped_last_at   = strftime('%Y-%m-%dT%H:%M:%fZ','now')
		RETURNING id, price_amount, price_currency`

	var (
		id       int64
		amount   sql.NullFloat64
		currency sql.NullString
	)
	negotiable := 0
	if in.PriceNegotiable {
		negotiable = 1
	}
	promoted := 0
	if in.PromotedTop {
		promoted = 1
	}
	var postedAt sql.NullString
	if in.PostedAt != nil {
		postedAt = sql.NullString{
			String: in.PostedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
			Valid:  true,
		}
	}
	err := s.pools.Writer.QueryRowContext(ctx, q,
		in.Platform, in.Country, in.ExternalID, in.URL, in.Title,
		nullFloat(in.PriceAmount), nullString(in.PriceCurrency), negotiable,
		nullString(in.LocationRegion), nullString(in.LocationCity),
		postedAt,
		nullString(in.PrimaryImageURL), promoted,
	).Scan(&id, &amount, &currency)
	if err != nil {
		return scheduler.StoredListing{}, fmt.Errorf("upsert listing: %w", err)
	}

	out := scheduler.StoredListing{ID: id}
	if amount.Valid {
		v := amount.Float64
		out.PriceAmount = &v
	}
	if currency.Valid {
		out.PriceCurrency = currency.String
	}
	return out, nil
}

func (s *Store) InsertPriceObservation(ctx context.Context, listingID int64, eventType string, amount *float64, currency string) error {
	const q = `
		INSERT INTO price_observations (listing_id, event_type, price_amount, price_currency)
		VALUES (?, ?, ?, ?)`
	_, err := s.pools.Writer.ExecContext(ctx, q, listingID, eventType, nullFloat(amount), nullString(currency))
	if err != nil {
		return fmt.Errorf("insert price observation: %w", err)
	}
	return nil
}

func (s *Store) ListObservationsForListing(ctx context.Context, listingID int64, limit int32) ([]scheduler.PriceObservation, error) {
	if limit <= 0 {
		limit = 10
	}
	const q = `
		SELECT price_amount, price_currency
		FROM price_observations
		WHERE listing_id = ?
		ORDER BY observed_at DESC
		LIMIT ?`
	rows, err := s.pools.Reader.QueryContext(ctx, q, listingID, limit)
	if err != nil {
		return nil, fmt.Errorf("list observations: %w", err)
	}
	defer rows.Close()

	var out []scheduler.PriceObservation
	for rows.Next() {
		var amount sql.NullFloat64
		var currency sql.NullString
		if err := rows.Scan(&amount, &currency); err != nil {
			return nil, fmt.Errorf("scan observation: %w", err)
		}
		obs := scheduler.PriceObservation{}
		if amount.Valid {
			v := amount.Float64
			obs.Amount = &v
		}
		if currency.Valid {
			obs.Currency = currency.String
		}
		out = append(out, obs)
	}
	return out, rows.Err()
}

func (s *Store) InsertAlertSent(ctx context.Context, in scheduler.InsertAlertSentInput) error {
	const q = `
		INSERT OR IGNORE INTO alerts_sent (search_id, listing_id, criteria_hash, criteria)
		VALUES (?, ?, ?, ?)`
	_, err := s.pools.Writer.ExecContext(ctx, q, in.SearchID, in.ListingID, in.CriteriaHash, in.CriteriaJSON)
	if err != nil {
		return fmt.Errorf("insert alert: %w", err)
	}
	return nil
}

func (s *Store) RecordSearchListing(ctx context.Context, searchID, listingID int64) error {
	const q = `INSERT OR IGNORE INTO search_listings (search_id, listing_id) VALUES (?, ?)`
	_, err := s.pools.Writer.ExecContext(ctx, q, searchID, listingID)
	if err != nil {
		return fmt.Errorf("record search listing: %w", err)
	}
	return nil
}

func nullFloat(p *float64) sql.NullFloat64 {
	if p == nil {
		return sql.NullFloat64{}
	}
	return sql.NullFloat64{Float64: *p, Valid: true}
}

func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
