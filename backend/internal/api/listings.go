package api

import (
	"context"
	"errors"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/Hari-Hristov/the-great-find/backend/internal/money"
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

func enrichOneEUR(row *ListingRow) {
	if row.PriceAmount != nil && row.PriceCurrency != "" {
		if eur, ok := money.ToEUR(*row.PriceAmount, row.PriceCurrency); ok {
			v := eur
			row.PriceEUR = &v
		}
	}
}

func enrichEURPriceHistory(rows []PriceObservationRow) {
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
	}, func(ctx context.Context, in *ListListingsInput) (*struct{ Body ListListingsResponse }, error) {
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
		total, err := q.CountListings(ctx, f)
		if err != nil {
			return nil, err
		}
		enrichEUR(rows)
		return &struct{ Body ListListingsResponse }{Body: ListListingsResponse{Items: rows, Total: total}}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "get-listing",
		Method:      "GET",
		Path:        "/listings/{id}",
		Summary:     "Get a listing with photos, params, and recent price history",
	}, func(ctx context.Context, in *struct {
		ID int64 `path:"id"`
	}) (*struct{ Body GetListingResponse }, error) {
		row, err := q.GetListing(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		if row == nil {
			return nil, huma.Error404NotFound("listing not found")
		}
		enrichOneEUR(row)

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
		enrichEURPriceHistory(hist)

		return &struct{ Body GetListingResponse }{Body: GetListingResponse{
			Listing:      *row,
			Photos:       photos,
			Params:       params,
			PriceHistory: hist,
		}}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "update-listing-status",
		Method:      "PATCH",
		Path:        "/listings/{id}",
		Summary:     "Update listing status (e.g. hide a misleading listing)",
	}, func(ctx context.Context, in *struct {
		ID   int64 `path:"id"`
		Body struct {
			Status string `json:"status" enum:"active,hidden" doc:"New status for the listing."`
		}
	}) (*struct {
		Body ListingRow
	}, error) {
		if err := q.UpdateListingStatus(ctx, in.ID, in.Body.Status); err != nil {
			if errors.Is(err, ErrNotFound) {
				return nil, huma.Error404NotFound("listing not found")
			}
			return nil, err
		}
		row, err := q.GetListing(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		enrichOneEUR(row)
		return &struct{ Body ListingRow }{Body: *row}, nil
	})
}
