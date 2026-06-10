package api

import (
	"context"

	"github.com/danielgtaylor/huma/v2"
)

func registerAlerts(api huma.API, q Queries) {
	huma.Register(api, huma.Operation{
		OperationID: "list-alerts",
		Method:      "GET",
		Path:        "/alerts",
		Summary:     "List recently fired alerts joined with listing summary",
	}, func(ctx context.Context, in *struct {
		Limit int `query:"limit" required:"false" minimum:"1" maximum:"500" default:"100"`
	}) (*struct {
		Body struct {
			Items []AlertRow `json:"items"`
		}
	}, error) {
		limit := in.Limit
		if limit == 0 {
			limit = 100
		}
		rows, err := q.ListRecentAlerts(ctx, limit)
		if err != nil {
			return nil, err
		}
		out := &struct {
			Body struct {
				Items []AlertRow `json:"items"`
			}
		}{}
		out.Body.Items = rows
		return out, nil
	})
}

func registerAnalytics(api huma.API, q Queries) {
	huma.Register(api, huma.Operation{
		OperationID: "search-analytics",
		Method:      "GET",
		Path:        "/analytics/searches/{id}",
		Summary:     "Per-search analytics: min/avg/count plus a daily EUR trend",
	}, func(ctx context.Context, in *struct {
		ID          int64    `path:"id"`
		WindowDays  int      `query:"window_days" required:"false" minimum:"1" maximum:"365" default:"30"`
		PriceEURMin float64  `query:"price_eur_min" required:"false"`
		PriceEURMax float64  `query:"price_eur_max" required:"false"`
	}) (*struct{ Body AnalyticsRow }, error) {
		f := AnalyticsFilter{
			SearchID:   in.ID,
			WindowDays: in.WindowDays,
		}
		if f.WindowDays == 0 {
			f.WindowDays = 30
		}
		if in.PriceEURMin > 0 {
			v := in.PriceEURMin
			f.PriceEURMin = &v
		}
		if in.PriceEURMax > 0 {
			v := in.PriceEURMax
			f.PriceEURMax = &v
		}
		row, err := q.AnalyticsForSearch(ctx, f)
		if err != nil {
			return nil, err
		}
		return &struct{ Body AnalyticsRow }{Body: row}, nil
	})
}
