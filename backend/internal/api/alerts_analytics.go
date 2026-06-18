package api

import (
	"context"
	"errors"

	"github.com/danielgtaylor/huma/v2"
)

var allowedTagColors = map[string]bool{
	"red": true, "orange": true, "yellow": true, "green": true,
	"blue": true, "purple": true, "pink": true,
}

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

	huma.Register(api, huma.Operation{
		OperationID: "tag-alert",
		Method:      "PATCH",
		Path:        "/alerts/{id}",
		Summary:     "Set or clear a tag on an alert",
	}, func(ctx context.Context, in *struct {
		ID   int64 `path:"id"`
		Body struct {
			TagLabel *string `json:"tag_label"`
			TagColor *string `json:"tag_color"`
		}
	}) (*struct{}, error) {
		label := ""
		color := ""
		if in.Body.TagLabel != nil {
			label = *in.Body.TagLabel
		}
		if in.Body.TagColor != nil {
			color = *in.Body.TagColor
		}
		if len(label) > 100 {
			return nil, huma.Error422UnprocessableEntity("tag_label too long (max 100 chars)")
		}
		if color != "" && !allowedTagColors[color] {
			return nil, huma.Error422UnprocessableEntity("tag_color must be one of: red, orange, yellow, green, blue, purple, pink")
		}
		if err := q.TagAlert(ctx, in.ID, label, color); err != nil {
			if errors.Is(err, ErrNotFound) {
				return nil, huma.Error404NotFound("alert not found")
			}
			return nil, err
		}
		return &struct{}{}, nil
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
		Scope       string   `query:"scope" required:"false" default:"active" enum:"active,inactive"`
		PriceEURMin float64  `query:"price_eur_min" required:"false"`
		PriceEURMax float64  `query:"price_eur_max" required:"false"`
	}) (*struct{ Body AnalyticsRow }, error) {
		f := AnalyticsFilter{
			SearchID:   in.ID,
			WindowDays: in.WindowDays,
			Scope:      in.Scope,
		}
		if f.WindowDays == 0 {
			f.WindowDays = 30
		}
		if f.Scope == "" {
			f.Scope = "active"
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
