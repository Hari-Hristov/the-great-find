package api

import "time"

// SavedSearchRow is the API/store view of a saved_searches row.
type SavedSearchRow struct {
	ID                int64      `json:"id"`
	Name              string     `json:"name"`
	Platform          string     `json:"platform"`
	Country           string     `json:"country"`
	QueryParams       string     `json:"query_params"`             // raw JSON
	AlertCriteria     string     `json:"alert_criteria,omitempty"` // raw JSON, may be empty
	PollIntervalMin   int        `json:"poll_interval_min"`
	MaxListingAgeDays int        `json:"max_listing_age_days"`
	Active            bool       `json:"active"`
	CreatedAt         time.Time  `json:"created_at"`
	LastPolledAt      *time.Time `json:"last_polled_at,omitempty"`
}

type CreateSavedSearchInput struct {
	Name              string
	Platform          string
	Country           string
	QueryParams       string
	AlertCriteria     string
	PollIntervalMin   int
	MaxListingAgeDays int
	Active            bool
}

type UpdateSavedSearchInput struct {
	ID                int64
	Name              string
	QueryParams       string
	AlertCriteria     string
	PollIntervalMin   int
	MaxListingAgeDays int
	Active            bool
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
	ID                   int64     `json:"id"`
	SearchID             int64     `json:"search_id"`
	ListingID            int64     `json:"listing_id"`
	CriteriaHash         string    `json:"criteria_hash"`
	Criteria             string    `json:"criteria"`
	SentAt               time.Time `json:"sent_at"`
	TagLabel             string    `json:"tag_label,omitempty"`
	TagColor             string    `json:"tag_color,omitempty"`
	ListingTitle         string    `json:"listing_title,omitempty"`
	ListingURL           string    `json:"listing_url,omitempty"`
	ListingStatus        string    `json:"listing_status,omitempty"`
	ListingPriceAmount   *float64  `json:"listing_price_amount,omitempty"`
	ListingPriceCurrency string    `json:"listing_price_currency,omitempty"`
	ListingPriceEUR      *float64  `json:"listing_price_eur,omitempty"`
}

type AnalyticsFilter struct {
	SearchID    int64
	WindowDays  int
	Scope       string // "active" (default) | "inactive"
	PriceEURMin *float64
	PriceEURMax *float64
}

type AnalyticsRow struct {
	SearchID     int64    `json:"search_id"`
	WindowDays   int      `json:"window_days"`
	Scope        string   `json:"scope"`
	ListingCount int      `json:"listing_count"`
	MinEUR       *float64 `json:"min_eur,omitempty"`
	MaxEUR       *float64 `json:"max_eur,omitempty"`
	AvgEUR       *float64 `json:"avg_eur,omitempty"`
	TrendEUR     []TrendPoint `json:"trend_eur"`
	// Inactive-scope only.
	DOMAvgDays      *float64 `json:"dom_avg_days,omitempty"`
	DOMMedianDays   *float64 `json:"dom_median_days,omitempty"`
	AbsorptionPerWk *int     `json:"absorption_per_week,omitempty"`
}

type TrendPoint struct {
	Day   string  `json:"day"`   // YYYY-MM-DD
	AvgEUR float64 `json:"avg_eur"`
	N      int     `json:"n"`
}

type ListListingsResponse struct {
	Items []ListingRow `json:"items"`
	Total int          `json:"total"`
}

type GetListingResponse struct {
	Listing      ListingRow            `json:"listing"`
	Photos       []Photo               `json:"photos"`
	Params       []Param               `json:"params"`
	PriceHistory []PriceObservationRow `json:"price_history"`
}

type ListSearchesResponse struct {
	Items []SavedSearchRow `json:"items"`
}

type PollAllSearchesResponse struct {
	Count int `json:"count" doc:"Number of polls fired."`
}

type ListAlertsResponse struct {
	Items []AlertRow `json:"items"`
}

type GetConfigResponse struct {
	Categories map[string]string `json:"categories"`
}

type ListListingsInput struct {
	SearchID    int64   `query:"search_id" required:"false" doc:"Filter to listings touched by a saved search via alerts_sent or polls. Optional."`
	Status      string  `query:"status" required:"false" enum:"active,removed,sold,hidden" doc:"Soft-delete status."`
	PostedAfter string  `query:"posted_after" required:"false" doc:"RFC-3339 timestamp; only listings posted at/after this time."`
	PriceEURMin float64 `query:"price_eur_min" required:"false"`
	PriceEURMax float64 `query:"price_eur_max" required:"false"`
	Limit       int     `query:"limit" required:"false" minimum:"1" maximum:"500" default:"100"`
	Offset      int     `query:"offset" required:"false" minimum:"0" default:"0"`
}

type SearchAnalyticsInput struct {
	ID          int64   `path:"id"`
	WindowDays  int     `query:"window_days" required:"false" minimum:"1" maximum:"365" default:"30"`
	Scope       string  `query:"scope" required:"false" default:"active" enum:"active,inactive"`
	PriceEURMin float64 `query:"price_eur_min" required:"false"`
	PriceEURMax float64 `query:"price_eur_max" required:"false"`
}
