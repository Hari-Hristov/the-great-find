package api

import (
	"context"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/harihristov/the-great-find/backend/internal/money"
)

func enrichEUR(rows []ListingRow) {
	for i := range rows {
		if rows[i].PriceAmount != nil && rows[i].PriceCurrency != "" {
			if eur, ok := money.ToEUR(*rows[i].PriceAmount, rows[i].PriceCurrency); ok {
				v := eur
				rows[i].PriceEUR = &v
			}
		}
	}
}

func registerListings(api huma.API, q Queries) {
	huma.Register(api, huma.Operation{
		OperationID: "list-listings",
		Method:      "GET",
		Path:        "/listings",
		Summary:     "List listings with optional filters",
	}, func(ctx context.Context, in *struct {
		SearchID     int64   `query:"search_id" required:"false" doc:"Filter to listings touched by a saved search via alerts_sent or polls. Optional."`
		Status       string  `query:"status" required:"false" enum:"active,removed,sold" doc:"Soft-delete status."`
		PostedAfter  string  `query:"posted_after" required:"false" doc:"RFC-3339 timestamp; only listings posted at/after this time."`
		PriceEURMin  float64 `query:"price_eur_min" required:"false"`
		PriceEURMax  float64 `query:"price_eur_max" required:"false"`
		Limit        int     `query:"limit" required:"false" minimum:"1" maximum:"500" default:"100"`
		Offset       int     `query:"offset" required:"false" minimum:"0" default:"0"`
	}) (*struct {
		Body struct {
			Items []ListingRow `json:"items"`
		}
	}, error) {
		f := ListingFilter{
			Status: in.Status,
			Limit:  in.Limit,
			Offset: in.Offset,
		}
		if in.SearchID > 0 {
			id := in.SearchID
			f.SearchID = &id
		}
		if in.PostedAfter != "" {
			t, err := time.Parse(time.RFC3339, in.PostedAfter)
			if err != nil {
				return nil, huma.Error400BadRequest("posted_after must be RFC-3339")
			}
			f.PostedAfter = &t
		}
		if in.PriceEURMin > 0 {
			v := in.PriceEURMin
			f.PriceEURMin = &v
		}
		if in.PriceEURMax > 0 {
			v := in.PriceEURMax
			f.PriceEURMax = &v
		}

		rows, err := q.ListListings(ctx, f)
		if err != nil {
			return nil, err
		}
		enrichEUR(rows)
		out := &struct {
			Body struct {
				Items []ListingRow `json:"items"`
			}
		}{}
		out.Body.Items = rows
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "get-listing",
		Method:      "GET",
		Path:        "/listings/{id}",
		Summary:     "Get a listing with photos, params, and recent price history",
	}, func(ctx context.Context, in *struct {
		ID int64 `path:"id"`
	}) (*struct {
		Body struct {
			Listing      ListingRow            `json:"listing"`
			Photos       []Photo               `json:"photos"`
			Params       []Param               `json:"params"`
			PriceHistory []PriceObservationRow `json:"price_history"`
		}
	}, error) {
		row, err := q.GetListing(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		if row == nil {
			return nil, huma.Error404NotFound("listing not found")
		}
		one := []ListingRow{*row}
		enrichEUR(one)

		photos, err := q.ListListingPhotos(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		params, err := q.ListListingParams(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		hist, err := q.ListPriceHistory(ctx, in.ID, 30)
		if err != nil {
			return nil, err
		}
		for i := range hist {
			if hist[i].PriceAmount != nil && hist[i].PriceCurrency != "" {
				if eur, ok := money.ToEUR(*hist[i].PriceAmount, hist[i].PriceCurrency); ok {
					v := eur
					hist[i].PriceEUR = &v
				}
			}
		}

		out := &struct {
			Body struct {
				Listing      ListingRow            `json:"listing"`
				Photos       []Photo               `json:"photos"`
				Params       []Param               `json:"params"`
				PriceHistory []PriceObservationRow `json:"price_history"`
			}
		}{}
		out.Body.Listing = one[0]
		out.Body.Photos = photos
		out.Body.Params = params
		out.Body.PriceHistory = hist
		return out, nil
	})
}
