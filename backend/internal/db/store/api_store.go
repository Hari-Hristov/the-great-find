// Store extension for the Phase 5 API surface.
//
// These methods sit alongside the scheduler-facing methods in store.go and
// satisfy api.Queries. Same conventions apply: reads via pools.Reader, writes
// via pools.Writer.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Hari-Hristov/the-great-find/backend/internal/api"
)

// Compile-time assertion that Store satisfies api.Queries (which embeds scheduler.Queries).
var _ api.Queries = (*Store)(nil)

const tsLayout = "2006-01-02T15:04:05.000Z"

func parseTS(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	// SQLite mixes %Y-%m-%dT%H:%M:%fZ (millis) and the RFC-3339 second-precision
	// form depending on which default fired. Try both.
	if t, err := time.Parse(tsLayout, s); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339, s)
}

func parseTSPtr(ns sql.NullString) (*time.Time, error) {
	if !ns.Valid || ns.String == "" {
		return nil, nil
	}
	t, err := parseTS(ns.String)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func scanSavedSearch(row interface{ Scan(...any) error }) (api.SavedSearchRow, error) {
	var (
		r              api.SavedSearchRow
		alertCriteria  sql.NullString
		active         int
		createdAtStr   string
		lastPolledAtNS sql.NullString
	)
	if err := row.Scan(
		&r.ID, &r.Name, &r.Platform, &r.Country,
		&r.QueryParams, &alertCriteria, &r.PollIntervalMin, &r.MaxListingAgeDays,
		&active, &createdAtStr, &lastPolledAtNS,
	); err != nil {
		return api.SavedSearchRow{}, err
	}
	if alertCriteria.Valid {
		r.AlertCriteria = alertCriteria.String
	}
	r.Active = active != 0
	if t, err := parseTS(createdAtStr); err == nil {
		r.CreatedAt = t
	}
	lp, err := parseTSPtr(lastPolledAtNS)
	if err == nil {
		r.LastPolledAt = lp
	}
	return r, nil
}

func (s *Store) GetSavedSearch(ctx context.Context, id int64) (*api.SavedSearchRow, error) {
	const q = `
		SELECT id, name, platform, country, query_params, alert_criteria,
		       poll_interval_min, max_listing_age_days, active, created_at, last_polled_at
		FROM saved_searches WHERE id = ?`
	r, err := scanSavedSearch(s.pools.Reader.QueryRowContext(ctx, q, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get saved search: %w", err)
	}
	return &r, nil
}

func (s *Store) ListAllSavedSearches(ctx context.Context) ([]api.SavedSearchRow, error) {
	const q = `
		SELECT id, name, platform, country, query_params, alert_criteria,
		       poll_interval_min, max_listing_age_days, active, created_at, last_polled_at
		FROM saved_searches ORDER BY id`
	rows, err := s.pools.Reader.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list saved searches: %w", err)
	}
	defer rows.Close()

	out := []api.SavedSearchRow{}
	for rows.Next() {
		r, err := scanSavedSearch(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) CreateSavedSearch(ctx context.Context, in api.CreateSavedSearchInput) (api.SavedSearchRow, error) {
	const q = `
		INSERT INTO saved_searches (name, platform, country, query_params, alert_criteria, poll_interval_min, max_listing_age_days, active)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING id, name, platform, country, query_params, alert_criteria,
		          poll_interval_min, max_listing_age_days, active, created_at, last_polled_at`
	active := 0
	if in.Active {
		active = 1
	}
	row := s.pools.Writer.QueryRowContext(ctx, q,
		in.Name, in.Platform, in.Country, in.QueryParams,
		nullString(in.AlertCriteria), in.PollIntervalMin, in.MaxListingAgeDays, active,
	)
	r, err := scanSavedSearch(row)
	if err != nil {
		return api.SavedSearchRow{}, fmt.Errorf("create saved search: %w", err)
	}
	return r, nil
}

func (s *Store) UpdateSavedSearch(ctx context.Context, in api.UpdateSavedSearchInput) (api.SavedSearchRow, error) {
	const q = `
		UPDATE saved_searches
		SET name = ?, query_params = ?, alert_criteria = ?,
		    poll_interval_min = ?, max_listing_age_days = ?, active = ?
		WHERE id = ?
		RETURNING id, name, platform, country, query_params, alert_criteria,
		          poll_interval_min, max_listing_age_days, active, created_at, last_polled_at`
	active := 0
	if in.Active {
		active = 1
	}
	row := s.pools.Writer.QueryRowContext(ctx, q,
		in.Name, in.QueryParams, nullString(in.AlertCriteria),
		in.PollIntervalMin, in.MaxListingAgeDays, active, in.ID,
	)
	r, err := scanSavedSearch(row)
	if errors.Is(err, sql.ErrNoRows) {
		return api.SavedSearchRow{}, api.ErrNotFound
	}
	if err != nil {
		return api.SavedSearchRow{}, fmt.Errorf("update saved search: %w", err)
	}
	return r, nil
}

func (s *Store) DeleteSavedSearch(ctx context.Context, id int64) error {
	res, err := s.pools.Writer.ExecContext(ctx, `DELETE FROM saved_searches WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete saved search: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return api.ErrNotFound
	}
	return nil
}

func scanListing(row interface{ Scan(...any) error }) (api.ListingRow, error) {
	var (
		r                  api.ListingRow
		desc, currency     sql.NullString
		categoryID         sql.NullString
		region, city       sql.NullString
		primaryImage       sql.NullString
		amount             sql.NullFloat64
		negotiable, top    int
		postedAt, scrapedF sql.NullString
		scrapedL           string
	)
	if err := row.Scan(
		&r.ID, &r.Platform, &r.Country, &r.ExternalID, &r.URL, &r.Title,
		&desc, &amount, &currency, &negotiable,
		&categoryID, &region, &city,
		&postedAt, &scrapedF, &scrapedL, &r.Status,
		&primaryImage, &top,
	); err != nil {
		return api.ListingRow{}, err
	}
	if desc.Valid {
		r.Description = desc.String
	}
	if amount.Valid {
		v := amount.Float64
		r.PriceAmount = &v
	}
	if currency.Valid {
		r.PriceCurrency = currency.String
	}
	r.PriceNegotiable = negotiable != 0
	if categoryID.Valid {
		r.CategoryID = categoryID.String
	}
	if region.Valid {
		r.LocationRegion = region.String
	}
	if city.Valid {
		r.LocationCity = city.String
	}
	if postedAt.Valid {
		if t, err := parseTS(postedAt.String); err == nil {
			r.PostedAt = &t
		}
	}
	if scrapedF.Valid {
		if t, err := parseTS(scrapedF.String); err == nil {
			r.ScrapedFirstAt = t
		}
	}
	if t, err := parseTS(scrapedL); err == nil {
		r.ScrapedLastAt = t
	}
	if primaryImage.Valid {
		r.PrimaryImageURL = primaryImage.String
	}
	r.PromotedTop = top != 0
	return r, nil
}

const listingCols = `id, platform, country, external_id, url, title,
	description, price_amount, price_currency, price_negotiable,
	category_id, location_region, location_city,
	posted_at, scraped_first_at, scraped_last_at, status,
	primary_image_url, promoted_top`

// listingFilterClauses builds the WHERE-clause fragments + args for a
// ListingFilter. Shared between ListListings and CountListings so the count
// always matches the rows the list query would return for the same filter.
//
// The posted_at filter coalesces with scraped_first_at — listings with a NULL
// posted_at (some apiclient paths leave it unset) would otherwise silently
// drop out of any "last N days" window.
func listingFilterClauses(f api.ListingFilter) (clauses []string, args []any) {
	if f.SearchID != nil {
		clauses = append(clauses, `id IN (SELECT listing_id FROM search_listings WHERE search_id = ?)`)
		args = append(args, *f.SearchID)
	}
	if f.Status != "" {
		clauses = append(clauses, `status = ?`)
		args = append(args, f.Status)
	}
	if f.PostedAfter != nil {
		clauses = append(clauses, `datetime(COALESCE(posted_at, scraped_first_at)) >= datetime(?)`)
		args = append(args, f.PostedAfter.UTC().Format(time.RFC3339))
	}
	if f.PriceEURMin != nil {
		clauses = append(clauses,
			`((price_currency IN ('EUR','eur','€') AND price_amount >= ?) OR
			   (price_currency IN ('BGN','bgn') AND price_amount >= ? * 1.95583))`)
		args = append(args, *f.PriceEURMin, *f.PriceEURMin)
	}
	if f.PriceEURMax != nil {
		clauses = append(clauses,
			`((price_currency IN ('EUR','eur','€') AND price_amount <= ?) OR
			   (price_currency IN ('BGN','bgn') AND price_amount <= ? * 1.95583))`)
		args = append(args, *f.PriceEURMax, *f.PriceEURMax)
	}
	return clauses, args
}

func (s *Store) ListListings(ctx context.Context, f api.ListingFilter) ([]api.ListingRow, error) {
	clauses, args := listingFilterClauses(f)
	where := ""
	if len(clauses) > 0 {
		where = "WHERE " + strings.Join(clauses, " AND ")
	}
	limit := f.Limit
	if limit <= 0 {
		limit = 100
	}
	q := fmt.Sprintf(`SELECT %s FROM listings %s ORDER BY scraped_first_at DESC LIMIT ? OFFSET ?`,
		listingCols, where)
	args = append(args, limit, f.Offset)

	rows, err := s.pools.Reader.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list listings: %w", err)
	}
	defer rows.Close()

	out := []api.ListingRow{}
	for rows.Next() {
		r, err := scanListing(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) CountListings(ctx context.Context, f api.ListingFilter) (int, error) {
	clauses, args := listingFilterClauses(f)
	where := ""
	if len(clauses) > 0 {
		where = "WHERE " + strings.Join(clauses, " AND ")
	}
	q := fmt.Sprintf(`SELECT COUNT(*) FROM listings %s`, where)
	var n int
	if err := s.pools.Reader.QueryRowContext(ctx, q, args...).Scan(&n); err != nil {
		return 0, fmt.Errorf("count listings: %w", err)
	}
	return n, nil
}

func (s *Store) GetListing(ctx context.Context, id int64) (*api.ListingRow, error) {
	q := fmt.Sprintf(`SELECT %s FROM listings WHERE id = ?`, listingCols)
	row, err := scanListing(s.pools.Reader.QueryRowContext(ctx, q, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get listing: %w", err)
	}
	return &row, nil
}

func (s *Store) UpdateListingStatus(ctx context.Context, id int64, status string) error {
	res, err := s.pools.Writer.ExecContext(ctx,
		`UPDATE listings SET status = ? WHERE id = ?`, status, id)
	if err != nil {
		return fmt.Errorf("update listing status: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return api.ErrNotFound
	}
	return nil
}

func (s *Store) ListListingPhotos(ctx context.Context, listingID int64) ([]api.Photo, error) {
	const q = `SELECT url, thumb_url, position FROM listing_photos WHERE listing_id = ? ORDER BY position`
	rows, err := s.pools.Reader.QueryContext(ctx, q, listingID)
	if err != nil {
		return nil, fmt.Errorf("list photos: %w", err)
	}
	defer rows.Close()

	out := []api.Photo{}
	for rows.Next() {
		var p api.Photo
		var thumb sql.NullString
		if err := rows.Scan(&p.URL, &thumb, &p.Position); err != nil {
			return nil, err
		}
		if thumb.Valid {
			p.ThumbURL = thumb.String
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) ListListingParams(ctx context.Context, listingID int64) ([]api.Param, error) {
	const q = `SELECT key, value FROM listing_params WHERE listing_id = ? ORDER BY key`
	rows, err := s.pools.Reader.QueryContext(ctx, q, listingID)
	if err != nil {
		return nil, fmt.Errorf("list params: %w", err)
	}
	defer rows.Close()

	out := []api.Param{}
	for rows.Next() {
		var p api.Param
		var val sql.NullString
		if err := rows.Scan(&p.Key, &val); err != nil {
			return nil, err
		}
		if val.Valid {
			p.Value = val.String
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) ListPriceHistory(ctx context.Context, listingID int64, limit int) ([]api.PriceObservationRow, error) {
	if limit <= 0 {
		limit = 30
	}
	const q = `
		SELECT observed_at, event_type, price_amount, price_currency
		FROM price_observations
		WHERE listing_id = ?
		ORDER BY observed_at DESC
		LIMIT ?`
	rows, err := s.pools.Reader.QueryContext(ctx, q, listingID, limit)
	if err != nil {
		return nil, fmt.Errorf("list price history: %w", err)
	}
	defer rows.Close()

	out := []api.PriceObservationRow{}
	for rows.Next() {
		var (
			r        api.PriceObservationRow
			obsAt    string
			amount   sql.NullFloat64
			currency sql.NullString
		)
		if err := rows.Scan(&obsAt, &r.EventType, &amount, &currency); err != nil {
			return nil, err
		}
		if t, err := parseTS(obsAt); err == nil {
			r.ObservedAt = t
		}
		if amount.Valid {
			v := amount.Float64
			r.PriceAmount = &v
		}
		if currency.Valid {
			r.PriceCurrency = currency.String
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) ListRecentAlerts(ctx context.Context, limit int) ([]api.AlertRow, error) {
	if limit <= 0 {
		limit = 100
	}
	const q = `
		SELECT a.id, a.search_id, a.listing_id, a.criteria_hash, a.criteria, a.sent_at,
		       a.tag_label, a.tag_color,
		       l.title, l.url, l.status
		FROM alerts_sent a
		LEFT JOIN listings l ON l.id = a.listing_id
		ORDER BY a.sent_at DESC
		LIMIT ?`
	rows, err := s.pools.Reader.QueryContext(ctx, q, limit)
	if err != nil {
		return nil, fmt.Errorf("list alerts: %w", err)
	}
	defer rows.Close()

	out := []api.AlertRow{}
	for rows.Next() {
		var (
			r                       api.AlertRow
			sentAt                  string
			tagLabel, tagColor      sql.NullString
			title, url              sql.NullString
			listingStatus           sql.NullString
		)
		if err := rows.Scan(&r.ID, &r.SearchID, &r.ListingID,
			&r.CriteriaHash, &r.Criteria, &sentAt, &tagLabel, &tagColor,
			&title, &url, &listingStatus); err != nil {
			return nil, err
		}
		if t, err := parseTS(sentAt); err == nil {
			r.SentAt = t
		}
		if tagLabel.Valid {
			r.TagLabel = tagLabel.String
		}
		if tagColor.Valid {
			r.TagColor = tagColor.String
		}
		if title.Valid {
			r.ListingTitle = title.String
		}
		if url.Valid {
			r.ListingURL = url.String
		}
		if listingStatus.Valid {
			r.ListingStatus = listingStatus.String
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) TagAlert(ctx context.Context, id int64, label, color string) error {
	var tagLabel, tagColor interface{}
	if label != "" {
		tagLabel = label
		tagColor = color
	}
	res, err := s.pools.Writer.ExecContext(ctx,
		`UPDATE alerts_sent SET tag_label = ?, tag_color = ? WHERE id = ?`,
		tagLabel, tagColor, id)
	if err != nil {
		return fmt.Errorf("tag alert: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return api.ErrNotFound
	}
	return nil
}

func (s *Store) AnalyticsForSearch(ctx context.Context, f api.AnalyticsFilter) (api.AnalyticsRow, error) {
	if f.WindowDays <= 0 {
		f.WindowDays = 30
	}
	if f.Scope != "active" && f.Scope != "inactive" {
		f.Scope = "active"
	}
	out := api.AnalyticsRow{SearchID: f.SearchID, WindowDays: f.WindowDays, Scope: f.Scope, TrendEUR: []api.TrendPoint{}}

	// Status clause depends on scope.
	var statusClause string
	if f.Scope == "inactive" {
		statusClause = ` AND l.status IN ('removed','sold')`
	} else {
		statusClause = ` AND l.status = 'active'`
	}

	// Build price clauses for listings table (same EUR conversion logic as listingFilterClauses).
	var priceClauses []string
	var priceArgs []any
	if f.PriceEURMin != nil {
		priceClauses = append(priceClauses,
			`((l.price_currency IN ('EUR','eur','€') AND l.price_amount >= ?) OR
			   (l.price_currency IN ('BGN','bgn') AND l.price_amount >= ? * 1.95583))`)
		priceArgs = append(priceArgs, *f.PriceEURMin, *f.PriceEURMin)
	}
	if f.PriceEURMax != nil {
		priceClauses = append(priceClauses,
			`((l.price_currency IN ('EUR','eur','€') AND l.price_amount <= ?) OR
			   (l.price_currency IN ('BGN','bgn') AND l.price_amount <= ? * 1.95583))`)
		priceArgs = append(priceArgs, *f.PriceEURMax, *f.PriceEURMax)
	}
	priceWhere := ""
	if len(priceClauses) > 0 {
		priceWhere = " AND " + strings.Join(priceClauses, " AND ")
	}

	// Count distinct matching listings (not observations).
	countQ := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM listings l
		WHERE l.id IN (SELECT listing_id FROM search_listings WHERE search_id = ?)%s%s`,
		statusClause, priceWhere)
	countArgs := append([]any{f.SearchID}, priceArgs...)
	var listingCount int
	if err := s.pools.Reader.QueryRowContext(ctx, countQ, countArgs...).Scan(&listingCount); err != nil {
		return out, fmt.Errorf("analytics count: %w", err)
	}
	out.ListingCount = listingCount

	// Min/avg/max: latest price observation per matching listing.
	statsQ := fmt.Sprintf(`
		SELECT o.price_amount, o.price_currency
		FROM price_observations o
		JOIN listings l ON l.id = o.listing_id
		WHERE l.id IN (SELECT listing_id FROM search_listings WHERE search_id = ?)%s
		  AND o.observed_at = (SELECT MAX(o2.observed_at) FROM price_observations o2 WHERE o2.listing_id = l.id)
		  AND o.price_amount IS NOT NULL%s`,
		statusClause, priceWhere)
	statsArgs := append([]any{f.SearchID}, priceArgs...)
	rows, err := s.pools.Reader.QueryContext(ctx, statsQ, statsArgs...)
	if err != nil {
		return out, fmt.Errorf("analytics stats: %w", err)
	}
	defer rows.Close()

	var (
		sum     float64
		minV    float64
		maxV    float64
		haveMin bool
		obsCount int
	)
	for rows.Next() {
		var amount float64
		var currency sql.NullString
		if err := rows.Scan(&amount, &currency); err != nil {
			return out, err
		}
		eur := amount
		if currency.Valid && (currency.String == "BGN" || currency.String == "bgn") {
			eur = amount / 1.95583
		}
		obsCount++
		sum += eur
		if !haveMin || eur < minV {
			minV = eur
			haveMin = true
		}
		if eur > maxV {
			maxV = eur
		}
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	if obsCount > 0 {
		avg := sum / float64(obsCount)
		out.AvgEUR = &avg
		mn := minV
		out.MinEUR = &mn
		mx := maxV
		out.MaxEUR = &mx
	}

	// Daily trend: average EUR per day in the window, respecting price filter.
	trendQ := fmt.Sprintf(`
		SELECT substr(o.observed_at, 1, 10) AS day,
		       AVG(CASE
		             WHEN o.price_currency IN ('BGN','bgn') THEN o.price_amount / 1.95583
		             ELSE o.price_amount
		           END) AS avg_eur,
		       COUNT(*) AS n
		FROM price_observations o
		JOIN listings l ON l.id = o.listing_id
		WHERE l.id IN (SELECT listing_id FROM search_listings WHERE search_id = ?)%s
		  AND datetime(o.observed_at) >= datetime('now', printf('-%%d days', %d))
		  AND o.price_amount IS NOT NULL%s
		GROUP BY day
		ORDER BY day`, statusClause, f.WindowDays, priceWhere)
	trendArgs := append([]any{f.SearchID}, priceArgs...)
	tRows, err := s.pools.Reader.QueryContext(ctx, trendQ, trendArgs...)
	if err != nil {
		return out, fmt.Errorf("analytics trend: %w", err)
	}
	defer tRows.Close()
	for tRows.Next() {
		var p api.TrendPoint
		if err := tRows.Scan(&p.Day, &p.AvgEUR, &p.N); err != nil {
			return out, err
		}
		out.TrendEUR = append(out.TrendEUR, p)
	}
	if err := tRows.Err(); err != nil {
		return out, err
	}

	// Inactive-scope extras: days on market + absorption rate.
	if f.Scope == "inactive" {
		// AVG DOM.
		domAvgQ := fmt.Sprintf(`
			SELECT AVG(julianday(l.scraped_last_at) - julianday(l.scraped_first_at))
			FROM listings l
			WHERE l.id IN (SELECT listing_id FROM search_listings WHERE search_id = ?)%s%s`,
			statusClause, priceWhere)
		domAvgArgs := append([]any{f.SearchID}, priceArgs...)
		var domAvg sql.NullFloat64
		if err := s.pools.Reader.QueryRowContext(ctx, domAvgQ, domAvgArgs...).Scan(&domAvg); err != nil {
			return out, fmt.Errorf("analytics dom avg: %w", err)
		}
		if domAvg.Valid {
			v := domAvg.Float64
			out.DOMAvgDays = &v
		}

		// Median DOM via SQLite middle-row trick.
		domMedianQ := fmt.Sprintf(`
			SELECT AVG(dom) FROM (
			    SELECT julianday(l.scraped_last_at) - julianday(l.scraped_first_at) AS dom
			    FROM listings l
			    WHERE l.id IN (SELECT listing_id FROM search_listings WHERE search_id = ?)%s%s
			    ORDER BY dom
			    LIMIT 2 - (SELECT COUNT(*) FROM listings l2
			               WHERE l2.id IN (SELECT listing_id FROM search_listings WHERE search_id = ?)%s%s) %% 2
			    OFFSET (SELECT (COUNT(*) - 1) / 2
			            FROM listings l3
			            WHERE l3.id IN (SELECT listing_id FROM search_listings WHERE search_id = ?)%s%s)
			)`,
			statusClause, priceWhere, statusClause, priceWhere, statusClause, priceWhere)
		domMedianArgs := append([]any{f.SearchID}, priceArgs...)
		domMedianArgs = append(domMedianArgs, f.SearchID)
		domMedianArgs = append(domMedianArgs, priceArgs...)
		domMedianArgs = append(domMedianArgs, f.SearchID)
		domMedianArgs = append(domMedianArgs, priceArgs...)
		var domMedian sql.NullFloat64
		if err := s.pools.Reader.QueryRowContext(ctx, domMedianQ, domMedianArgs...).Scan(&domMedian); err != nil {
			return out, fmt.Errorf("analytics dom median: %w", err)
		}
		if domMedian.Valid {
			v := domMedian.Float64
			out.DOMMedianDays = &v
		}

		absQ := fmt.Sprintf(`
			SELECT COUNT(*)
			FROM listings l
			WHERE l.id IN (SELECT listing_id FROM search_listings WHERE search_id = ?)%s%s
			  AND datetime(l.scraped_last_at) >= datetime('now', '-7 days')`,
			statusClause, priceWhere)
		absArgs := append([]any{f.SearchID}, priceArgs...)
		var absorption int
		if err := s.pools.Reader.QueryRowContext(ctx, absQ, absArgs...).Scan(&absorption); err != nil {
			return out, fmt.Errorf("analytics absorption: %w", err)
		}
		out.AbsorptionPerWk = &absorption
	}

	return out, nil
}
