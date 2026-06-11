package api

import "time"

// SavedSearchRow is the API/store view of a saved_searches row.
type SavedSearchRow struct {
	ID              int64      `json:"id"`
	Name            string     `json:"name"`
	Platform        string     `json:"platform"`
	Country         string     `json:"country"`
	QueryParams     string     `json:"query_params"`             // raw JSON
	AlertCriteria   string     `json:"alert_criteria,omitempty"` // raw JSON, may be empty
	PollIntervalMin int        `json:"poll_interval_min"`
	Active          bool       `json:"active"`
	CreatedAt       time.Time  `json:"created_at"`
	LastPolledAt    *time.Time `json:"last_polled_at,omitempty"`
}

type CreateSavedSearchInput struct {
	Name            string
	Platform        string
	Country         string
	QueryParams     string
	AlertCriteria   string
	PollIntervalMin int
	Active          bool
}

type UpdateSavedSearchInput struct {
	ID              int64
	Name            string
	QueryParams     string
	AlertCriteria   string
	PollIntervalMin int
	Active          bool
}

// ListingRow is the canonical API/store view of a listings row.
type ListingRow struct {
	ID              int64      `json:"id"`
	Platform        string     `json:"platform"`
	Country         string     `json:"country"`
	ExternalID      string     `json:"external_id"`
	URL             string     `json:"url"`
	Title           string     `json:"title"`
	Description     string     `json:"description,omitempty"`
	PriceAmount     *float64   `json:"price_amount,omitempty"`
	PriceCurrency   string     `json:"price_currency,omitempty"`
	PriceEUR        *float64   `json:"price_eur,omitempty"`
	PriceNegotiable bool       `json:"price_negotiable"`
	CategoryID      string     `json:"category_id,omitempty"`
	LocationRegion  string     `json:"location_region,omitempty"`
	LocationCity    string     `json:"location_city,omitempty"`
	PostedAt        *time.Time `json:"posted_at,omitempty"`
	ScrapedFirstAt  time.Time  `json:"scraped_first_at"`
	ScrapedLastAt   time.Time  `json:"scraped_last_at"`
	Status          string     `json:"status"`
	PrimaryImageURL string     `json:"primary_image_url,omitempty"`
	PromotedTop     bool       `json:"promoted_top"`
}

type ListingFilter struct {
	SearchID     *int64
	Status       string
	PostedAfter  *time.Time
	PriceEURMin  *float64
	PriceEURMax  *float64
	Limit        int
	Offset       int
}

type Photo struct {
	URL      string `json:"url"`
	ThumbURL string `json:"thumb_url,omitempty"`
	Position int    `json:"position"`
}

type Param struct {
	Key   string `json:"key"`
	Value string `json:"value,omitempty"`
}

type PriceObservationRow struct {
	ObservedAt    time.Time `json:"observed_at"`
	EventType     string    `json:"event_type"`
	PriceAmount   *float64  `json:"price_amount,omitempty"`
	PriceCurrency string    `json:"price_currency,omitempty"`
	PriceEUR      *float64  `json:"price_eur,omitempty"`
}

type AlertRow struct {
	ID            int64     `json:"id"`
	SearchID      int64     `json:"search_id"`
	ListingID     int64     `json:"listing_id"`
	CriteriaHash  string    `json:"criteria_hash"`
	Criteria      string    `json:"criteria"`
	SentAt        time.Time `json:"sent_at"`
	Flagged       bool      `json:"flagged"`
	ListingTitle  string    `json:"listing_title,omitempty"`
	ListingURL    string    `json:"listing_url,omitempty"`
	ListingStatus string    `json:"listing_status,omitempty"`
}

type AnalyticsFilter struct {
	SearchID    int64
	WindowDays  int
	PriceEURMin *float64
	PriceEURMax *float64
}

type AnalyticsRow struct {
	SearchID     int64    `json:"search_id"`
	WindowDays   int      `json:"window_days"`
	ListingCount int      `json:"listing_count"`
	MinEUR       *float64 `json:"min_eur,omitempty"`
	MaxEUR       *float64 `json:"max_eur,omitempty"`
	AvgEUR       *float64 `json:"avg_eur,omitempty"`
	TrendEUR     []TrendPoint `json:"trend_eur"`
}

type TrendPoint struct {
	Day   string  `json:"day"`   // YYYY-MM-DD
	AvgEUR float64 `json:"avg_eur"`
	N      int     `json:"n"`
}
